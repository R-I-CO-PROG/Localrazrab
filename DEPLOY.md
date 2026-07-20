# Деплой Mercai-v2

Есть два способа. **Production на mercai.ru работает по варианту A (PM2 на одном VPS).**
Вариант B (Docker Compose) — альтернатива для чистого окружения.

## Архитектура (одинакова для A и B)

```
Пользователь → HTTPS (Nginx) → Next.js web :3000
                                  │  /api/backend/*  (+ X-API-Key, server-side)
                                  │  /uploads/*      (rewrite → API)
                                  ▼
                               NestJS API :3001  (только internal)
                                  ▼
                          PostgreSQL + Redis  (только internal)
                                  ▼
                          OpenRouter (скачивает logo/refs по PUBLIC_API_URL)
```

Правила, которые нельзя нарушать:

- Браузер ходит **только** на `/api/backend/*` (`NEXT_PUBLIC_API_BASE=/api/backend`). Никогда напрямую на `:3001`.
- BFF (Next server-side) ходит на внутренний API через `SUVENIR_API_URL`.
- `API_SECRET_KEY` **одинаковый** в web и api.
- `PUBLIC_API_URL` — публичный `https://`-URL, по которому OpenRouter скачивает `/uploads/...`.
- `IMAGE_PROVIDER=external` — иначе генерируются только sharp-mockup'ы вместо AI-фото.

> **Критическое отличие A и B:** внутренний адрес API.
> - **A (PM2, один хост):** `SUVENIR_API_URL=http://127.0.0.1:3001`, БД/Redis на `127.0.0.1`.
> - **B (Docker):** `SUVENIR_API_URL=http://api:3001`, БД/Redis — `postgres` / `redis`.
> Если на PM2 поставить `http://api:3001` — имя не резолвится, BFF не достучится до API.

---

## Вариант A — PM2 на VPS (mercai.ru) — ПРОДАКШЕН

Стек на одном хосте: host PostgreSQL (:5432), Redis (apt, :6379), PM2 `mercai-api` (:3001) + `mercai-web` (:3000), Nginx (TLS) → :3000.

### 1. Подготовка `.env`

```bash
cd /var/www/Mercai-v2
cp .env.mercai.production.example .env
nano .env   # заполнить DATABASE_URL, BETTER_AUTH_SECRET, API_SECRET_KEY, OPENROUTER_API_KEY
```

`API_SECRET_KEY`: `openssl rand -hex 32`.
`DATABASE_URL` берётся из старого `/var/www/Mercai/.env` (та же БД с пользователями).

### 2. Автоматический деплой

Скрипт идемпотентный: ставит пакеты/Node/PM2/pnpm/Redis, подтягивает код, **дописывает недостающие env (включая весь AI-блок)**, синхронизирует `.env` в `apps/api` и `apps/web`, делает Prisma + build + PM2 + проверки.

```bash
sed -i 's/\r$//' scripts/deploy-mercai-v2-vps.sh
sudo bash scripts/deploy-mercai-v2-vps.sh
```

> Prisma: схема пушится **только** через `@suvenir/web` (полная схема auth + api).
> **Никогда** не запускайте `prisma db push` в `apps/api` на боевой БД — там нет auth-таблиц, Prisma их удалит.

### 3. Ручной деплой (если нужно по шагам)

```bash
cd /var/www/Mercai-v2
git pull --ff-only
cp .env apps/api/.env
cp .env apps/web/.env
cp .env apps/web/.env.local            # NEXT_PUBLIC_* инлайнятся при build из .env.local

pnpm install
pnpm --filter @suvenir/web exec prisma generate
pnpm --filter @suvenir/web exec prisma db push     # ТОЛЬКО web (полная схема)
pnpm --filter @suvenir/api exec prisma generate    # api — только generate, без db push!

pnpm --filter @suvenir/api build
pnpm --filter @suvenir/web build

pm2 delete mercai-web mercai-api mertsai 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
```

### 4. Nginx

Весь трафик (включая `/uploads` и `/api/backend`) идёт на Next :3000.

```nginx
server {
    server_name mercai.ru www.mercai.ru;

    client_max_body_size 25m;          # загрузка logo/брендбука

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;       # запас для серверных BFF-операций
        proxy_send_timeout 300s;
    }
    # TLS (certbot) добавляет listen 443 / ssl_certificate ниже
}
```

> AI-операции не держат HTTP открытым: generate/discover/refine ставят job в BullMQ и
> сразу возвращают request/job, фронт опрашивает статус. 504 от долгой генерации быть не должно.

### 5. Проверка

```bash
bash scripts/diagnose-vps.sh        # полная end-to-end диагностика
pm2 list
pm2 logs mercai-api --lines 40
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3000/api/backend/health
curl -s http://127.0.0.1:3000/api/me
```

### 6. Откат на старый сайт

```bash
pm2 delete mercai-web mercai-api
cd /var/www/Mercai && pm2 start ecosystem.config.cjs   # старый mertsai
pm2 save
```

---

## Вариант B — Docker Compose

```bash
cp .env.production.example .env
openssl rand -hex 32   # API_SECRET_KEY
openssl rand -hex 16   # POSTGRES_PASSWORD, REDIS_PASSWORD
nano .env              # заполнить секреты + OPENROUTER_API_KEY

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma db push
docker compose -f docker-compose.prod.yml exec api npx prisma db seed   # каталог
```

Reverse proxy (Caddy) перед :3000:

```
mercai.ru {
  reverse_proxy localhost:3000
}
```

В Docker `SUVENIR_API_URL=http://api:3001`, БД/Redis — `postgres` / `redis`.

---

## Обязательные переменные (production)

| Переменная | A (PM2) | B (Docker) | Назначение |
|------------|---------|------------|------------|
| `DATABASE_URL` | `…@127.0.0.1:5432/…` | `…@postgres:5432/…` | PostgreSQL |
| `REDIS_URL` | `redis://127.0.0.1:6379` | `redis://:pass@redis:6379` | BullMQ |
| `SUVENIR_API_URL` | `http://127.0.0.1:3001` | `http://api:3001` | BFF → API |
| `NEXT_PUBLIC_API_BASE` | `/api/backend` | `/api/backend` | браузер → BFF |
| `PUBLIC_API_URL` | `https://mercai.ru` | `https://домен` | OpenRouter refs |
| `NEXT_PUBLIC_SITE_HOST` | `mercai.ru` | `домен` | next/image |
| `CORS_ORIGIN` | `https://mercai.ru` | `https://домен` | CORS |
| `API_SECRET_KEY` | один и тот же в api+web | то же | защита API |
| `IMAGE_PROVIDER` | `external` | `external` | AI-фото (не mockup) |
| `OPENROUTER_API_KEY` | ключ | ключ | LLM + image |
| `OPENROUTER_ENABLED` | `true` | `true` | OpenRouter on |
| `LLM_PROVIDER` / `LLM_GENERATION_PROVIDER` | `openrouter` | `openrouter` | LLM |
| `AGENTS_ENABLED` / `CREATIVE_AGENT_PIPELINE` | `true` | `true` | Ideator/Critic |

Полные шаблоны: `.env.mercai.production.example` (PM2), `.env.production.example` (Docker).

---

## Чеклист перед go-live

- [ ] `API_SECRET_KEY` сгенерирован, **одинаков** в `.env` / `apps/api/.env` / `apps/web/.env(.local)`, не в git
- [ ] **Ротировать** `OPENROUTER_API_KEY` (ключ попадал в репозиторий/скриншоты)
- [ ] `IMAGE_PROVIDER=external` и `OPENROUTER_API_KEY` заданы (иначе только mockup)
- [ ] `PUBLIC_API_URL=https://mercai.ru`, и `https://mercai.ru/uploads/...` открывается из интернета
- [ ] Порты 5432/6379/3001 **не** открыты наружу (только 80/443)
- [ ] `NODE_ENV=production` на api и web
- [ ] uploads и БД на постоянном диске (бэкап); restart PM2/контейнеров их не стирает
- [ ] Лимиты расходов в OpenRouter dashboard
- [ ] `bash scripts/diagnose-vps.sh` — без FAIL

---

## Безопасность (production)

- Браузер — только через BFF `/api/backend` + `X-API-Key` (добавляется server-side).
- Доверенные BFF-запросы не режутся throttler'ом (`BffThrottlerGuard`); внешние — 120 req/min, 30 AI/час.
- Helmet, sanitize debug, SVG upload blocked, debug off при `NODE_ENV=production`.
- `/health` публичный; `/health/details` — под `API_SECRET_KEY`.

---

## Локальная разработка

```bash
docker compose up -d        # postgres :5433 + redis :6379
pnpm dev                    # web :3000, api :3001
```

`apps/api/.env` — рабочий AI-конфиг (IMAGE_PROVIDER=external, OpenRouter, агенты).
`apps/web/.env.local` — BFF/auth для web.
Без `API_SECRET_KEY` API принимает запросы без ключа (удобно локально).
