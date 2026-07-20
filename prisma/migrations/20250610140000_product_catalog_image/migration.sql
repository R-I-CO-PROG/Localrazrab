-- Catalog product photos (studio renders) for UI and AI mockup
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "catalogImageUrl" TEXT;
