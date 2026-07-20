ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegramId" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegramVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "user_telegramId_key" ON "user"("telegramId");
