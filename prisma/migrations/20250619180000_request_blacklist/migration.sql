-- Blacklist fields for catalog filtering (idempotent for prod that applied manual SQL)
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "blacklistedProductIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "blacklistedSupplierIds" JSONB NOT NULL DEFAULT '[]';
