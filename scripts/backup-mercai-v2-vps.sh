#!/usr/bin/env bash
# Бэкап Mercai-v2 на VPS (PM2): PostgreSQL, .env, uploads.
#
# Использование (root на сервере):
#   cd /var/www/Mercai-v2
#   sed -i 's/\r$//' scripts/backup-mercai-v2-vps.sh
#   chmod +x scripts/backup-mercai-v2-vps.sh
#   sudo bash scripts/backup-mercai-v2-vps.sh
#
# Скачать на ПК (PowerShell):
#   scp root@80.78.253.49:/var/backups/mercai/mercai-v2-backup-*.tar.gz C:\Users\ЮлЯ\Desktop\

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Mercai-v2}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/mercai}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
STAGING="${BACKUP_ROOT}/.staging-${TIMESTAMP}"
ARCHIVE="${BACKUP_ROOT}/mercai-v2-backup-${TIMESTAMP}.tar.gz"
INCLUDE_CATALOG="${INCLUDE_CATALOG:-0}"

if [[ $EUID -ne 0 ]]; then
  echo "Запустите от root: sudo bash $0"
  exit 1
fi

mkdir -p "$BACKUP_ROOT" "$STAGING"

echo "==> Mercai-v2 backup ${TIMESTAMP}"
echo "    APP_DIR=${APP_DIR}"
echo "    ARCHIVE=${ARCHIVE}"

# --- .env ---
echo "==> .env"
for f in .env apps/api/.env apps/web/.env apps/web/.env.local; do
  if [[ -f "${APP_DIR}/${f}" ]]; then
    mkdir -p "${STAGING}/$(dirname "$f")"
    cp "${APP_DIR}/${f}" "${STAGING}/${f}"
  fi
done

# --- uploads (логотипы, generated, previews) ---
echo "==> uploads"
if [[ -d "${APP_DIR}/uploads" ]]; then
  cp -a "${APP_DIR}/uploads" "${STAGING}/uploads"
else
  mkdir -p "${STAGING}/uploads"
  echo "WARN: ${APP_DIR}/uploads не найден"
fi

# --- PM2 state (список процессов) ---
echo "==> PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist > "${STAGING}/pm2-jlist.json" 2>/dev/null || true
  pm2 list > "${STAGING}/pm2-list.txt" 2>/dev/null || true
fi

# --- PostgreSQL ---
echo "==> PostgreSQL dump"
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ОШИБКА: ${ENV_FILE} не найден"
  exit 1
fi

read_database_url() {
  grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$ENV_FILE" | tail -n1 \
    | sed -E 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//' \
    | tr -d '\r' \
    | sed -e "s/^['\"]//" -e "s/['\"]$//"
}

# pg_dump/libpq не понимают ?schema=public (это параметр Prisma, не PostgreSQL)
sanitize_pg_url() {
  local raw="$1"
  echo "$raw" | tr -d '\r' | sed -E 's/[?#&].*$//'
}

extract_pg_dbname() {
  local url="$1"
  echo "$url" | sed -E 's|.*/([^/?#]+)$|\1|'
}

DATABASE_URL="$(read_database_url)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "ОШИБКА: DATABASE_URL не задан в .env"
  exit 1
fi

PG_URL="$(sanitize_pg_url "$DATABASE_URL")"
PG_DB="$(extract_pg_dbname "$PG_URL")"
echo "    DB: ${PG_DB} (URI без Prisma-параметров)"

run_pg_dump() {
  local out="$1"
  local format="${2:-plain}"
  if [[ "$format" == "custom" ]]; then
    pg_dump "$PG_URL" --no-owner --no-acl -F c -f "$out"
  else
    pg_dump "$PG_URL" --no-owner --no-acl > "$out"
  fi
}

run_pg_dump_local() {
  local out="$1"
  local format="${2:-plain}"
  if [[ "$format" == "custom" ]]; then
    sudo -u postgres pg_dump --no-owner --no-acl -F c -f "$out" "$PG_DB"
  else
    sudo -u postgres pg_dump --no-owner --no-acl "$PG_DB" > "$out"
  fi
}

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ОШИБКА: pg_dump не найден (apt-get install -y postgresql-client)"
  exit 1
fi

if run_pg_dump "${STAGING}/database.dump" custom 2>/dev/null; then
  echo "    database.dump ($(du -h "${STAGING}/database.dump" | cut -f1))"
elif run_pg_dump_local "${STAGING}/database.dump" custom; then
  echo "    database.dump via sudo -u postgres ($(du -h "${STAGING}/database.dump" | cut -f1))"
else
  echo "ОШИБКА: pg_dump не удался. Проверьте DATABASE_URL и доступ к PostgreSQL."
  echo "    PG_URL (без пароля): ${PG_URL/@*/@***}"
  exit 1
fi

if run_pg_dump "${STAGING}/database.sql" plain 2>/dev/null; then
  :
elif run_pg_dump_local "${STAGING}/database.sql" plain; then
  :
else
  echo "WARN: plain SQL dump не создан"
fi
echo "    database.sql ($(du -h "${STAGING}/database.sql" 2>/dev/null | cut -f1 || echo '?'))"

# --- Каталог (опционально, ~950 MB) ---
if [[ "$INCLUDE_CATALOG" == "1" ]]; then
  echo "==> catalog-handoff-full (INCLUDE_CATALOG=1)"
  if [[ -d "${APP_DIR}/data/catalog-handoff-full" ]]; then
    mkdir -p "${STAGING}/data"
    cp -a "${APP_DIR}/data/catalog-handoff-full" "${STAGING}/data/catalog-handoff-full"
  else
    echo "WARN: каталог не найден"
  fi
else
  echo "==> catalog-handoff-full пропущен (INCLUDE_CATALOG=1 чтобы включить)"
fi

# --- Манифест ---
cat > "${STAGING}/MANIFEST.txt" <<EOF
Mercai-v2 backup
Created: ${TIMESTAMP}
Host: $(hostname)
APP_DIR: ${APP_DIR}
INCLUDE_CATALOG: ${INCLUDE_CATALOG}
Files:
$(find "$STAGING" -type f | wc -l) files
EOF

# --- Архив ---
echo "==> Архив"
tar -czf "$ARCHIVE" -C "$BACKUP_ROOT" ".staging-${TIMESTAMP}"
rm -rf "$STAGING"

SIZE="$(du -h "$ARCHIVE" | cut -f1)"

# --- Ротация: храним последние KEEP_DAYS ежедневных архивов, остальное удаляем ---
KEEP_DAYS="${KEEP_DAYS:-7}"
echo ""
echo "==> Ротация (храним последние ${KEEP_DAYS})"
find "$BACKUP_ROOT" -maxdepth 1 -name "mercai-v2-backup-*.tar.gz" -mtime "+${KEEP_DAYS}" -print -delete

echo ""
echo "Готово: ${ARCHIVE} (${SIZE})"
echo ""
echo "Скачать на ПК:"
echo "  scp root@$(hostname -I | awk '{print $1}'):${ARCHIVE} ~/Desktop/"
echo ""
echo "Восстановление БД (осторожно, перезапишет данные):"
echo "  pg_restore -d \"\$(grep DATABASE_URL .env | sed 's/?.*//')\" --clean --if-exists database.dump"
echo "  # или: sudo -u postgres pg_restore -d mertsai --clean --if-exists database.dump"
