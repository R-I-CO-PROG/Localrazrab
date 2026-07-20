# Cursor Handoff Notes — Suvenir AI

## Продукт

**Suvenir AI** — MVP SaaS для AI-концепций корпоративного мерча.

Флоу: **Бриф → Набор → Концепция** (мокап или AI-фотореализм).

Техническое имя пакета монорепо: `suvenir` (не меняли).

## Архитектура

```
apps/web/          Next.js 15 App Router, главная page.tsx
apps/api/          NestJS REST + BullMQ worker
uploads/           Статика: /uploads/* (multer + express static)
docker-compose     PostgreSQL :5433, Redis :6379
```

## Frontend (`apps/web`)

| Путь | Назначение |
|------|------------|
| `src/app/page.tsx` | Оркестрация флоу (состояние, API) |
| `src/components/BriefForm.tsx` | Бриф |
| `src/components/ConceptStepper.tsx` | Шаги 1-2-3 |
| `src/components/ConceptResult.tsx` | Описание для КП |
| `src/components/PreviewPanel.tsx` | Превью / результат |
| `src/components/ProductCatalog.tsx` | Каталог |
| `src/lib/api.ts` | HTTP-клиент |
| `src/lib/concept-brief.ts` | Текст концепции, export .txt |

Брендинг UI: **Suvenir AI**. Debug — кнопка «Dev» в header.

`generationCount === 0` — backend лимит одной генерации на request. «Новая концепция» сбрасывает frontend state и создаёт новый request при следующем действии.

## Backend (`apps/api`)

| Путь | Назначение |
|------|------------|
| `src/requests/` | CRUD запросов, submit, generate |
| `src/generation/generation.processor.ts` | BullMQ job: LLM → image |
| `src/generation/branded-mockup.composer.ts` | Локальный мокап (sharp) |
| `src/providers/image/` | Image providers chain |
| `src/providers/llm/` | LLM providers |
| `src/assets/` | Upload логотипа/референсов |
| `prisma/schema.prisma` | Модели |
| `prisma/seed.ts` | 50 товаров + SVG силуэты |

### Генерация изображения

1. **mockup** (UI): `BrandedMockupImageProvider` — каталожные фото + логотип
2. **ai** (UI): `AiEnhancedMockupImageProvider` → PiAPI kontext поверх мокапа

Ключевые файлы:

- `piapi-image.provider.ts` — mockup → upload → kontext
- `ai-enhanced-mockup-image.provider.ts` — цепочка провайдеров
- `piapi-kontext.prompt.ts` — промпты для PiAPI

### LLM

- `llm-brief.service.ts` — интерпретация брифа
- `openrouter-llm.provider.ts` — основной (free model)
- `stub-llm.provider.ts` — без ключей

`POST /requests/:id/suggest-products` — подбор без полной генерации.

## Prisma

Миграции: `apps/api/prisma/migrations/`

Важные поля:

- `Product.catalogImageUrl` — фото каталога (PiAPI script)
- `Request.generationCount` — лимит 1 generate
- `Generation.llmOutput` — JSON (composition, style, _debug, _resultMeta)

```bash
cd apps/api
pnpm prisma:migrate
pnpm prisma:seed
pnpm run catalog:photos:piapi   # опционально: фото каталога
```

## Добавить товар

1. Запись в `prisma/seed.ts` (slug, name, category, silhouette SVG path)
2. `pnpm prisma:seed`
3. Опционально: `catalog:photos:piapi` для `catalogImageUrl`

## Добавить image provider

1. Реализовать `ImageProvider` в `src/providers/image/`
2. Зарегистрировать в `image.provider.ts` / `image.module.ts`
3. Подключить в `AiEnhancedMockupImageProvider` или `generation.processor`
4. Env-переменные + `.env.example`

## Решения при переделке MVP (2025-06)

- Бренд UI: **Suvenir AI** (не меняли npm package name)
- `page.tsx` разбит на компоненты (BriefForm, ConceptResult, …)
- Убраны фейковые «Pro / кредиты» → блок «Как это работает»
- После генерации: `ConceptResult` + копирование markdown / .txt
- «Новая концепция» — reset frontend без удаления старого request
- Upload: валидация MIME/расширений, 10 МБ
- UX-тексты без технического жаргона (LLM fallback → «базовый набор»)

## Env quick reference

```env
# Минимум для демо без ключей
LLM_PROVIDER=stub
IMAGE_PROVIDER=mockup
NEXT_PUBLIC_API_URL=http://localhost:3001

# AI
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...
PIAPI_API_KEY=...
PUBLIC_API_URL=http://localhost:3001
```

## Запуск dev

```bash
docker compose up -d
pnpm install
pnpm dev
# Windows PowerShell: pnpm.cmd dev
```
