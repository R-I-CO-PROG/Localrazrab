#!/bin/bash
set -e
cd /var/www/Mercai-v2/apps/api
export $(grep -v '^#' .env | xargs)
psql "$DATABASE_URL" -f prisma/migrations/manual_blacklist_columns.sql
