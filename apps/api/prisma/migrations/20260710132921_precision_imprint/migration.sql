-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "material" TEXT;

-- CreateTable
CREATE TABLE "ProductBranding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "zoneName" TEXT,
    "zoneNameRu" TEXT,
    "methodRaw" TEXT NOT NULL,
    "methodCode" TEXT NOT NULL,
    "maxWidthMm" INTEGER,
    "maxHeightMm" INTEGER,
    "maxAreaMm2" INTEGER,
    "maxColors" INTEGER,
    "setupCost" DOUBLE PRECISION,
    "zoneImageUrl" TEXT,
    "source" TEXT NOT NULL,

    CONSTRAINT "ProductBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecisionSession" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sourceImageUrl" TEXT NOT NULL,
    "productId" TEXT,
    "outputMode" TEXT NOT NULL DEFAULT 'edit',
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecisionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecisionRender" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "draftImageUrl" TEXT,
    "imageUrl" TEXT,
    "imagePrompt" TEXT,
    "judgeVerdict" JSONB,
    "error" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecisionRender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductBranding_productId_idx" ON "ProductBranding"("productId");

-- CreateIndex
CREATE INDEX "ProductBranding_productId_methodCode_idx" ON "ProductBranding"("productId", "methodCode");

-- CreateIndex
CREATE UNIQUE INDEX "PrecisionSession_requestId_key" ON "PrecisionSession"("requestId");

-- CreateIndex
CREATE INDEX "PrecisionRender_sessionId_sortOrder_idx" ON "PrecisionRender"("sessionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductBranding" ADD CONSTRAINT "ProductBranding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecisionSession" ADD CONSTRAINT "PrecisionSession_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecisionRender" ADD CONSTRAINT "PrecisionRender_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrecisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
