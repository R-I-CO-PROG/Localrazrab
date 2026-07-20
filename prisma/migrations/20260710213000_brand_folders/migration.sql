ALTER TYPE "BrandAssetType" ADD VALUE IF NOT EXISTS 'banner';

CREATE TABLE IF NOT EXISTS "brand_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_folder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brand_folder_userId_idx" ON "brand_folder"("userId");

ALTER TABLE "brand_folder" ADD CONSTRAINT "brand_folder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brand_asset" ADD COLUMN IF NOT EXISTS "folderId" TEXT;

CREATE INDEX IF NOT EXISTS "brand_asset_folderId_idx" ON "brand_asset"("folderId");

ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "brand_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
