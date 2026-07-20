#!/bin/bash
set -e
ENV=/var/www/Mercai-v2/.env
set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV"
  else
    echo "${key}=${val}" >> "$ENV"
  fi
}
set_kv OPENROUTER_IMAGE_MODEL_CATALOG google/gemini-3-pro-image-preview
set_kv OPENROUTER_CATALOG_ASPECT_RATIO 4:3
set_kv OPENROUTER_CATALOG_IMAGE_SIZE 1K
set_kv AI_POST_LOGO_COMPOSITE false
cp "$ENV" /var/www/Mercai-v2/apps/api/.env
cd /var/www/Mercai-v2
tar -xzf /tmp/mercai-api-catalog-visual.tar.gz
pm2 restart mercai-api
sleep 2
curl -fsS http://127.0.0.1:3001/health
echo ""
