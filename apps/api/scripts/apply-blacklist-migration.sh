#!/bin/bash
set -e
cd /var/www/Mercai-v2/apps/api
DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//" | sed 's/?schema=.*//')
psql "$DB_URL" -f prisma/migrations/manual_blacklist_columns.sql
