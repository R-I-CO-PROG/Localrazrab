# Масштабирование Mercai API

## Текущее состояние (июнь 2026)
- 1 инстанс pm2 (mercai-api)
- BullMQ concurrency: agent-run=3, generation=2
- In-memory кэш каталога (5 мин TTL, не шарится между инстансами)
- PostgreSQL: 51k SKU, без pg_trgm индексов

## При 15+ одновременных пользователях — следующие шаги
1. pg_trgm индексы (блок 1D выше) — ускорение SQL с ~200ms до ~10ms
2. Redis-кэш вместо in-memory Map для catalogPipelineCache —
   файл: catalog-pipeline-cache.util.ts, заменить Map на ioredis
   get/set с тем же TTL. Это позволит шарить кэш между инстансами.
3. pm2 cluster mode (2-4 инстанса) — после перехода на Redis-кэш.
4. Отдельный worker-процесс для generation (тяжёлые image задачи
   не блокируют agent-run discovery).

## При 50+ пользователях
5. Postgres: materialized view для brief search (обновление раз в час)
6. pgvector/tsvector семантический поиск вместо ILIKE
7. Горизонтальное масштабирование workers через отдельные VM
