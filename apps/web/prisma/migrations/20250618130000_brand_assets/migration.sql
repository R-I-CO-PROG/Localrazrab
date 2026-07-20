-- CreateEnum
CREATE TYPE "BrandAssetType" AS ENUM ('logo', 'brandbook');

-- CreateTable
CREATE TABLE IF NOT EXISTS "brand_asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BrandAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_asset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brand_asset_userId_idx" ON "brand_asset"("userId");
CREATE INDEX IF NOT EXISTS "brand_asset_userId_type_idx" ON "brand_asset"("userId", "type");

ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
