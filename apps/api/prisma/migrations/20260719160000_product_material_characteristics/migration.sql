ALTER TABLE "Product" ADD COLUMN "material" TEXT;
ALTER TABLE "Product" ADD COLUMN "characteristics" TEXT[] NOT NULL DEFAULT '{}';
