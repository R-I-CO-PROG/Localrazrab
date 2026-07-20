#!/bin/bash
set -a
source /var/www/Mercai-v2/apps/web/.env
set +a
cd /var/www/Mercai-v2/apps/web
node scripts/test-presentation-e2e.mjs
