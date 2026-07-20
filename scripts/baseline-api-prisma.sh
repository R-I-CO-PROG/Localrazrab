#!/bin/bash
# ONE-TIME on existing VPS DB that was created without prisma migrate tracking.
# Marks all current API migrations as applied, then migrate deploy works for new ones.
# Usage: bash scripts/baseline-api-prisma.sh [/var/www/Mercai-v2]
set -euo pipefail

ROOT="${1:-/var/www/Mercai-v2}"
API_DIR="$ROOT/apps/api"

cd "$API_DIR"
cp "$ROOT/.env" .env

MIGRATIONS=(
  20250609120000_init
  20250610140000_product_catalog_image
  20250612180000_agent_run
  20250612190000_agent_debug_log
  20250612193000_agent_concepts
  20250612200000_request_set_item_count
  20250619180000_request_blacklist
)

echo "==> Baseline: mark ${#MIGRATIONS[@]} migrations as applied"
for m in "${MIGRATIONS[@]}"; do
  if pnpm exec prisma migrate resolve --applied "$m"; then
    echo "  resolved $m"
  else
    echo "  skip/fail $m (may already be resolved)"
  fi
done

echo "==> migrate deploy (should be no-op or only net-new)"
pnpm exec prisma migrate deploy

echo "==> prisma generate"
pnpm exec prisma generate

echo "==> Baseline complete"
