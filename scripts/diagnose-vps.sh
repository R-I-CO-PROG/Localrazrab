#!/usr/bin/env bash
# Диагностика production-деплоя Mercai-v2 (mercai.ru) на VPS под PM2.
# Не меняет ничего — только проверяет архитектуру end-to-end.
#
#   cd /var/www/Mercai-v2
#   sed -i 's/\r$//' scripts/diagnose-vps.sh
#   bash scripts/diagnose-vps.sh

APP_DIR="${APP_DIR:-/var/www/Mercai-v2}"
DOMAIN="${DOMAIN:-mercai.ru}"
ENV_FILE="${APP_DIR}/.env"

pass() { echo "  OK   $*"; }
warn() { echo "  WARN $*"; }
fail() { echo "  FAIL $*"; }

getenv() {
  # читает значение KEY из .env (последнее вхождение), снимает кавычки
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//"
}

echo "==================================================="
echo " Mercai-v2 диагностика  ($(date '+%F %T'))"
echo " APP_DIR=${APP_DIR}  DOMAIN=${DOMAIN}"
echo "==================================================="

# 1) .env присутствует
echo ""
echo "[1] .env"
if [[ -f "$ENV_FILE" ]]; then
  pass ".env найден: $ENV_FILE"
else
  fail ".env НЕ найден: $ENV_FILE"
  exit 1
fi

# 2) Ключевые переменные и типовые ошибки
echo ""
echo "[2] Переменные окружения (значения секретов скрыты)"
SUV="$(getenv SUVENIR_API_URL)"
NPB="$(getenv NEXT_PUBLIC_API_BASE)"
PUB="$(getenv PUBLIC_API_URL)"
IMG="$(getenv IMAGE_PROVIDER)"
ORENABLED="$(getenv OPENROUTER_ENABLED)"
ORKEY="$(getenv OPENROUTER_API_KEY)"
APIKEY="$(getenv API_SECRET_KEY)"
DBURL="$(getenv DATABASE_URL)"
REDIS="$(getenv REDIS_URL)"
SITEHOST="$(getenv NEXT_PUBLIC_SITE_HOST)"

[[ "$NPB" == "/api/backend" ]] && pass "NEXT_PUBLIC_API_BASE=/api/backend" || warn "NEXT_PUBLIC_API_BASE='${NPB}' (ожидается /api/backend)"

case "$SUV" in
  http://127.0.0.1:3001|http://localhost:3001) pass "SUVENIR_API_URL=${SUV}" ;;
  *api:3001*) fail "SUVENIR_API_URL='${SUV}' — это docker hostname, на PM2 не резолвится! Нужно http://127.0.0.1:3001" ;;
  "") fail "SUVENIR_API_URL пуст" ;;
  *) warn "SUVENIR_API_URL='${SUV}' (ожидается http://127.0.0.1:3001)" ;;
esac

[[ "$PUB" == https://* ]] && pass "PUBLIC_API_URL=${PUB}" || warn "PUBLIC_API_URL='${PUB}' (для OpenRouter нужен публичный https URL)"
[[ "$IMG" == "external" ]] && pass "IMAGE_PROVIDER=external (AI генерация)" || fail "IMAGE_PROVIDER='${IMG}' — будет только sharp-mockup! Нужно external"
[[ "$ORENABLED" == "true" ]] && pass "OPENROUTER_ENABLED=true" || warn "OPENROUTER_ENABLED='${ORENABLED}'"
[[ -n "$ORKEY" ]] && pass "OPENROUTER_API_KEY задан" || fail "OPENROUTER_API_KEY пуст — генерация работать не будет"
[[ -n "$APIKEY" ]] && pass "API_SECRET_KEY задан" || warn "API_SECRET_KEY пуст — BFF не аутентифицируется в API (в prod обязателен)"
[[ -n "$DBURL" ]] && pass "DATABASE_URL задан" || fail "DATABASE_URL пуст"
[[ -n "$SITEHOST" ]] && pass "NEXT_PUBLIC_SITE_HOST=${SITEHOST}" || warn "NEXT_PUBLIC_SITE_HOST пуст — next/image может блокировать https картинки"

# Проверка совпадения API_SECRET_KEY между api/web .env
for sub in apps/api/.env apps/web/.env apps/web/.env.local; do
  if [[ -f "$APP_DIR/$sub" ]]; then
    K="$(grep -E '^API_SECRET_KEY=' "$APP_DIR/$sub" 2>/dev/null | tail -n1 | cut -d= -f2-)"
    if [[ "$K" == "$APIKEY" ]]; then pass "API_SECRET_KEY совпадает в $sub"; else fail "API_SECRET_KEY РАЗЛИЧАЕТСЯ в $sub"; fi
  else
    warn "$sub отсутствует (нужно cp .env $sub перед сборкой)"
  fi
done

# 3) PM2
echo ""
echo "[3] PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | grep -q '"name":"mercai-api"' && pass "mercai-api в PM2" || warn "mercai-api нет в PM2"
  pm2 jlist 2>/dev/null | grep -q '"name":"mercai-web"' && pass "mercai-web в PM2" || warn "mercai-web нет в PM2"
  pm2 list
else
  fail "pm2 не установлен"
fi

# 4) Redis
echo ""
echo "[4] Redis"
if command -v redis-cli >/dev/null 2>&1; then
  [[ "$(redis-cli ping 2>/dev/null)" == "PONG" ]] && pass "redis-cli ping = PONG" || fail "Redis не отвечает (systemctl start redis-server)"
else
  warn "redis-cli не найден"
fi

# 5) PostgreSQL через Prisma
echo ""
echo "[5] PostgreSQL"
if (cd "$APP_DIR" && pnpm --filter @suvenir/web exec prisma db execute --stdin <<<'SELECT 1;' >/dev/null 2>&1); then
  pass "Подключение к БД работает"
else
  warn "Не удалось проверить БД через prisma (проверьте DATABASE_URL вручную)"
fi

# 6) API liveness
echo ""
echo "[6] API :3001"
if curl -fsS "http://127.0.0.1:3001/health" >/dev/null 2>&1; then
  pass "GET /health → ok"
else
  fail "API не отвечает на 127.0.0.1:3001/health (pm2 logs mercai-api)"
fi
if [[ -n "$APIKEY" ]]; then
  DET="$(curl -fsS -H "X-API-Key: ${APIKEY}" "http://127.0.0.1:3001/health/details" 2>/dev/null)"
  if echo "$DET" | grep -q '"ok":true'; then pass "GET /health/details ok=true"; else warn "/health/details: ${DET:-нет ответа}"; fi
fi

# 7) Web BFF → API
echo ""
echo "[7] Web :3000 (BFF)"
if curl -fsS "http://127.0.0.1:3000/api/backend/health" >/dev/null 2>&1; then
  pass "GET /api/backend/health → API доступен через BFF"
else
  fail "BFF→API не работает (SUVENIR_API_URL/API_SECRET_KEY?)"
fi
ME="$(curl -fsS "http://127.0.0.1:3000/api/me" 2>/dev/null)"
echo "$ME" | grep -q '"dbConfigured":true' && pass "/api/me dbConfigured=true" || warn "/api/me: ${ME:-нет ответа}"

# 8) Публичная доступность uploads (для OpenRouter)
echo ""
echo "[8] Публичный доступ к /uploads (нужен OpenRouter)"
TESTDIR="${APP_DIR}/uploads/assets"
mkdir -p "$TESTDIR" 2>/dev/null
TESTFILE="diag-$(date +%s).txt"
echo "ok" > "${TESTDIR}/${TESTFILE}" 2>/dev/null
# через локальный web (rewrite /uploads → SUVENIR_API_URL)
if curl -fsS "http://127.0.0.1:3000/uploads/assets/${TESTFILE}" 2>/dev/null | grep -q ok; then
  pass "web :3000 проксирует /uploads → API"
else
  warn "web не отдаёт /uploads (проверьте next.config rewrites / SUVENIR_API_URL)"
fi
# публично (через nginx + TLS) — так ходит OpenRouter
if curl -fsS "${PUB}/uploads/assets/${TESTFILE}" 2>/dev/null | grep -q ok; then
  pass "${PUB}/uploads/... доступен из интернета (OpenRouter сможет скачать refs)"
else
  fail "${PUB}/uploads/... НЕдоступен — OpenRouter не увидит logo/refs (nginx/PUBLIC_API_URL)"
fi
rm -f "${TESTDIR}/${TESTFILE}" 2>/dev/null

# 9) Каталог
echo ""
echo "[9] Каталог"
CAT="$(getenv CATALOG_HANDOFF_DIR)"
[[ -f "${CAT}/catalog-index.json" ]] && pass "catalog-index.json есть (${CAT})" || warn "catalog-index.json не найден в ${CAT}"

echo ""
echo "==================================================="
echo " Готово. FAIL = чинить обязательно, WARN = проверить."
echo "==================================================="
