ALTER TABLE "Product" ADD COLUMN "materialTagged" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Product" SET "materialTagged" = true WHERE material IS NOT NULL OR characteristics != '{}';
