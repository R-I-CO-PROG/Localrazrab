# ULT Concept AI — объединённый проект

Фронтенд **ULT Concept AI** + бекенд **Suvenir** (NestJS, AI-генерация мерча).

## Структура

```
├── apps/
│   ├── api/          # NestJS API + BullMQ + Prisma (порт 3001)
│   └── web/          # Next.js UI ULT Concept AI (порт 3000)
├── bin/
│   ├── start.bat     # Запуск всего одной командой (Windows)
│   └── start.ps1     # То же для PowerShell
├── uploads/          # Логотипы и сгенерированные изображения
└── docker-compose.yml
```

## Быстрый старт

**Windows — двойной клик или из терминала:**

```bat
bin\start.bat
```

**PowerShell:**

```powershell
.\bin\start.ps1
```

Скрипт автоматически:
1. Поднимает Docker (PostgreSQL + Redis)
2. Устанавливает зависимости (`pnpm install`)
3. Создаёт `.env` файлы если их нет
4. Мигрирует и сидит базу
5. Запускает API (:3001), Web (:3000) и туннель (localtunnel)

## Ручной запуск

```powershell
docker compose up -d
pnpm install
copy .env.example apps\api\.env
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev          # API + Web
pnpm dev:all      # API + Web + Tunnel
```

- **Web UI:** http://localhost:3000
- **API:** http://localhost:3001
- **Health:** http://localhost:3001/health

## Как связаны части

| ULT (фронт) | Suvenir (бек) |
|-------------|---------------|
| `/generate` — форма | `POST /requests` → submit → generate |
| `/api/concepts/generate` (BFF) | Проксирует в NestJS API |
| `/concepts/results` | Результат после job polling |
| Режим `catalog` | `mode: mockup` |
| Режим `creative` | `mode: ai` |

## Требования

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop (PostgreSQL :5433, Redis :6379)

## Демо без API-ключей

В `apps/api/.env`:

```env
LLM_PROVIDER=stub
IMAGE_PROVIDER=local
```

Генерация работает локально через stub LLM и sharp-мокапы.
