#!/bin/bash
# Sync Web database schema + Prisma Client on VPS (brand_asset, Request fields).
# Usage: bash scripts/sync-web-prisma.sh [/var/www/Mercai-v2]
set -euo pipefail

ROOT="${1:-/var/www/Mercai-v2}"
WEB_DIR="$ROOT/apps/web"
ENV_FILE="$ROOT/.env"

if [[ ! -d "$WEB_DIR/prisma" ]]; then
  echo "ERROR: $WEB_DIR/prisma not found"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

cd "$WEB_DIR"
cp "$ENV_FILE" .env

if ! grep -q '^DATABASE_URL=' .env; then
  echo "ERROR: DATABASE_URL missing in $ENV_FILE"
  exit 1
fi

echo "==> prisma migrate deploy (Web)"
pnpm exec prisma migrate deploy

echo "==> prisma generate (Web)"
pnpm exec prisma generate

echo "==> Web Prisma sync OK"
