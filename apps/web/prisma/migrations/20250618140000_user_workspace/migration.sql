-- CreateTable
CREATE TABLE IF NOT EXISTS "user_workspace" (
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_workspace_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "user_workspace" ADD CONSTRAINT "user_workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
