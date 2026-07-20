#!/bin/bash
# Sync API database schema + Prisma Client on VPS (run after every API deploy).
# Usage: bash scripts/sync-api-prisma.sh [/var/www/Mercai-v2]
set -euo pipefail

ROOT="${1:-/var/www/Mercai-v2}"
API_DIR="$ROOT/apps/api"
ENV_FILE="$ROOT/.env"

if [[ ! -d "$API_DIR/prisma" ]]; then
  echo "ERROR: $API_DIR/prisma not found — include apps/api/prisma in deploy archive"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

cd "$API_DIR"
cp "$ENV_FILE" .env

if ! grep -q '^DATABASE_URL=' .env; then
  echo "ERROR: DATABASE_URL missing in $ENV_FILE"
  exit 1
fi

echo "==> prisma migrate deploy (API)"
if ! pnpm exec prisma migrate deploy; then
  echo ""
  echo "ERROR: prisma migrate deploy failed."
  echo "If this is the first time on an existing DB, run once:"
  echo "  bash scripts/baseline-api-prisma.sh $ROOT"
  exit 1
fi

echo "==> prisma generate (API)"
pnpm exec prisma generate

echo "==> prisma generate (Web — auth User/Session must win over API client)"
cd "$ROOT/apps/web"
cp "$ENV_FILE" .env
pnpm exec prisma generate

echo "==> Prisma sync OK"
