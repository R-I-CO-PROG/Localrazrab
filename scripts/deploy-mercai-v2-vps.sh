#!/usr/bin/env bash
# Деплой Mercai-v2 на VPS (mercai.ru) с сохранением PostgreSQL auth из старого Mercai.
#
# На сервере (root):
#   cd /var/www/Mercai-v2
#   sed -i 's/\r$//' scripts/deploy-mercai-v2-vps.sh
#   chmod +x scripts/deploy-mercai-v2-vps.sh
#   sudo bash scripts/deploy-mercai-v2-vps.sh
#
# Перед первым запуском: отредактируйте /var/www/Mercai-v2/.env (OPENROUTER_API_KEY, API_SECRET_KEY)

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Mercai-v2}"
OLD_APP_DIR="${OLD_APP_DIR:-/var/www/Mercai}"
REPO_URL="${REPO_URL:-https://github.com/R-I-CO-PROG/Mercai-v2.git}"
DOMAIN="${DOMAIN:-mercai.ru}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ $EUID -ne 0 ]]; then
  echo "Запустите от root: sudo bash $0"
  exit 1
fi

echo "==> Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx redis-server build-essential

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  echo "==> Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm
fi

systemctl enable redis-server
systemctl start redis-server

echo "==> Код: ${APP_DIR}"
mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "ОШИБКА: в ${APP_DIR} есть незакоммиченные изменения — деплой остановлен, чтобы их не затереть."
    echo "Проверьте: git -C ${APP_DIR} status"
    echo "Закоммитьте/уберите изменения и запустите деплой снова."
    exit 1
  fi
  git fetch origin
  if ! git merge --ff-only origin/main; then
    echo "ОШИБКА: ветка main разошлась с origin/main (не fast-forward) — автоматический деплой остановлен."
    echo "Разберитесь вручную: git -C ${APP_DIR} log --oneline main..origin/main и origin/main..main"
    exit 1
  fi
fi
cd "$APP_DIR"

echo "==> .env"
if [[ ! -f "$APP_DIR/.env" ]]; then
  if [[ -f "$OLD_APP_DIR/.env" ]]; then
    echo "Копируем базу из ${OLD_APP_DIR}/.env"
    cp "$OLD_APP_DIR/.env" "$APP_DIR/.env"
  else
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  fi
fi

# Обязательные переменные для v2 (добавляем, если нет)
ensure_env() {
  local key="$1"
  local val="$2"
  if ! grep -q "^${key}=" "$APP_DIR/.env" 2>/dev/null; then
    echo "${key}=${val}" >> "$APP_DIR/.env"
  fi
}

# --- Сеть / маршрутизация (PM2 single-host: НЕ docker hostnames!) ---
ensure_env "NODE_ENV" "production"
ensure_env "API_PORT" "3001"
ensure_env "API_HOST" "127.0.0.1"
ensure_env "REDIS_URL" "redis://127.0.0.1:6379"
# BFF (Next server-side) → внутренний NestJS. На одном хосте это 127.0.0.1, НЕ http://api:3001
ensure_env "SUVENIR_API_URL" "http://127.0.0.1:3001"
# Браузер ходит только сюда (same-origin BFF)
ensure_env "NEXT_PUBLIC_API_BASE" "/api/backend"
ensure_env "NEXT_PUBLIC_APP_URL" "https://${DOMAIN}"
ensure_env "BETTER_AUTH_URL" "https://${DOMAIN}"
# Публичный хост для next/image remotePatterns (https://${DOMAIN}/uploads/**)
ensure_env "NEXT_PUBLIC_SITE_HOST" "${DOMAIN}"
# Публичный URL, по которому OpenRouter скачивает logo/refs из /uploads
ensure_env "PUBLIC_API_URL" "https://${DOMAIN}"
ensure_env "CORS_ORIGIN" "https://${DOMAIN}"
ensure_env "CATALOG_HANDOFF_DIR" "${APP_DIR}/data/catalog-handoff-full"
ensure_env "UPLOADS_DIR" "${APP_DIR}/uploads"

# --- LLM (текст: бриф, ideator, critic, prompt builder) ---
ensure_env "LLM_PROVIDER" "openrouter"
ensure_env "LLM_FALLBACK_TO_STUB" "true"
ensure_env "LLM_RESPECT_USER_PRODUCTS" "true"
ensure_env "LLM_GENERATION_PROVIDER" "openrouter"
ensure_env "LLM_GENERATION_FALLBACK_CHAIN" "gemini,deepseek"
ensure_env "LLM_GENERATION_FALLBACK_LOCAL" "true"

# --- OpenRouter (обязательно для генерации как на localhost) ---
ensure_env "OPENROUTER_ENABLED" "true"
ensure_env "OPENROUTER_SINGLE_MODEL" "true"
ensure_env "OPENROUTER_MODEL" "openai/gpt-4o-mini"
ensure_env "OPENROUTER_TIMEOUT_MS" "120000"
ensure_env "OPENROUTER_MAX_RETRIES" "2"
ensure_env "OPENROUTER_MAX_TOKENS" "2500"
ensure_env "OPENROUTER_RATE_LIMIT_ABORT_AFTER" "1"
ensure_env "OPENROUTER_MODEL_IDEATOR" "anthropic/claude-3-5-haiku"
ensure_env "OPENROUTER_MODEL_CRITIC" "openai/gpt-4o-mini"
ensure_env "OPENROUTER_MODEL_PROMPT" "openai/gpt-4o-mini"
ensure_env "OPENROUTER_MAX_TOKENS_IDEATOR" "6500"
ensure_env "OPENROUTER_MAX_TOKENS_CRITIC" "3200"
ensure_env "OPENROUTER_MAX_TOKENS_PROMPT" "800"
ensure_env "OPENROUTER_AGENT_RETRIES" "2"

# --- Агенты (Ideator → Critic → 5 концепций) ---
ensure_env "AGENTS_ENABLED" "true"
ensure_env "CREATIVE_AGENT_PIPELINE" "true"

# --- Image: внешняя AI-цепочка (БЕЗ этого будет только sharp-mockup!) ---
ensure_env "IMAGE_PROVIDER" "external"
ensure_env "IMAGE_FALLBACK_TO_LOCAL" "true"
ensure_env "AI_SKIP_OPENROUTER_IMAGE" "false"
ensure_env "AI_SKIP_POLLINATIONS" "true"
ensure_env "AI_SKIP_HUGGINGFACE" "true"
ensure_env "AI_NO_MOCKUP_FALLBACK" "true"
ensure_env "AI_POST_LOGO_COMPOSITE" "true"

# --- OpenRouter image (preview / final / refine) ---
ensure_env "OPENROUTER_PREVIEW_ENABLED" "true"
ensure_env "OPENROUTER_IMAGE_MODEL_PREVIEW" "black-forest-labs/flux.2-klein-4b"
ensure_env "OPENROUTER_PREVIEW_JPEG_QUALITY" "85"
ensure_env "OPENROUTER_IMAGE_MODEL_FINAL" "google/gemini-2.5-flash-image"
ensure_env "OPENROUTER_REFINE_MODEL" "google/gemini-2.5-flash-image"
ensure_env "OPENROUTER_FINAL_ASPECT_RATIO" "1:1"
ensure_env "OPENROUTER_FINAL_IMAGE_SIZE" "1K"
ensure_env "OPENROUTER_MAX_PRODUCT_REFS" "6"
ensure_env "OPENROUTER_PRODUCT_REF_MAX_PX" "768"
ensure_env "OPENROUTER_IMAGE_TIMEOUT_MS" "240000"
ensure_env "OPENROUTER_IMAGE_RETRIES" "2"

# --- BullMQ / mockup размеры ---
ensure_env "GENERATION_LOCK_MS" "900000"
ensure_env "MOCKUP_WIDTH" "1024"
ensure_env "MOCKUP_HEIGHT" "1024"
ensure_env "AI_ENHANCE_WIDTH" "1024"
ensure_env "AI_ENHANCE_HEIGHT" "1024"

if ! grep -q "^API_SECRET_KEY=.\+" "$APP_DIR/.env" 2>/dev/null; then
  SECRET="$(openssl rand -hex 32)"
  ensure_env "API_SECRET_KEY" "$SECRET"
  echo "Сгенерирован API_SECRET_KEY (сохранён в .env)"
fi

if ! grep -q "^DATABASE_URL=.\+" "$APP_DIR/.env" 2>/dev/null; then
  echo "ОШИБКА: DATABASE_URL не задан в .env"
  echo "Скопируйте из бэкапа или ${OLD_APP_DIR}/.env"
  exit 1
fi

if ! grep -q "^OPENROUTER_API_KEY=.\+" "$APP_DIR/.env" 2>/dev/null; then
  echo "ВНИМАНИЕ: OPENROUTER_API_KEY пуст — генерация концепций и AI-фото работать НЕ будет."
  echo "          Возьмите ключ в OpenRouter dashboard и впишите в ${APP_DIR}/.env"
fi

echo ""
echo ">>> Проверьте .env: OPENROUTER_API_KEY, DATABASE_URL, BETTER_AUTH_SECRET, API_SECRET_KEY"
echo ">>> nano ${APP_DIR}/.env"
echo ""
read -r -p "Нажмите Enter когда .env готов, или Ctrl+C для отмены..."

echo "==> Синхронизация .env для API и Web"
cp "$APP_DIR/.env" "$APP_DIR/apps/api/.env"
cp "$APP_DIR/.env" "$APP_DIR/apps/web/.env"
cp "$APP_DIR/.env" "$APP_DIR/apps/web/.env.local"
grep -q "^DATABASE_URL=" "$APP_DIR/apps/api/.env" || {
  echo "ОШИБКА: DATABASE_URL отсутствует в ${APP_DIR}/.env"
  exit 1
}

echo "==> npm install + build"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "==> Prisma (полная схема через Web — не удаляет user/session!)"
pnpm --filter @suvenir/web exec prisma generate
pnpm --filter @suvenir/web exec prisma db push
pnpm --filter @suvenir/api exec prisma generate
# НЕ запускать prisma db push в apps/api — там нет auth-таблиц, Prisma их удалит!

echo "==> Seed каталога (может занять время)"
pnpm --filter @suvenir/api prisma:seed || echo "WARN: seed пропущен или частично выполнен"

pnpm --filter @suvenir/api build
pnpm --filter @suvenir/web build

mkdir -p "$APP_DIR/uploads"

echo "==> PM2"
pm2 delete mercai-web mercai-api mertsai 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Проверка готовности (даём API стартануть)"
sleep 6
echo "--- API liveness (ожидается {\"ok\":true}) ---"
curl -fsS "http://127.0.0.1:3001/health" || echo "WARN: API health недоступен — pm2 logs mercai-api"
echo ""
echo "--- Web BFF → API (ожидается {\"ok\":true}) ---"
curl -fsS "http://127.0.0.1:3000/api/backend/health" || echo "WARN: BFF→API недоступен — проверьте SUVENIR_API_URL/API_SECRET_KEY"
echo ""
echo "--- Web auth/credits (ожидается dbConfigured:true) ---"
curl -fsS "http://127.0.0.1:3000/api/me" || echo "WARN: web /api/me недоступен"
echo ""
echo "--- Redis ---"
redis-cli ping 2>/dev/null || echo "WARN: redis-cli ping не ответил"

echo ""
echo "Готово."
echo "  Сайт: https://${DOMAIN}"
echo "  PM2:  pm2 list"
echo "  Логи: pm2 logs mercai-api --lines 40 ; pm2 logs mercai-web --lines 40"
echo "  Диагностика: bash scripts/diagnose-vps.sh"
echo ""
echo "Nginx должен проксировать ${DOMAIN} → 127.0.0.1:3000 (весь трафик, включая /uploads и /api/backend)."
