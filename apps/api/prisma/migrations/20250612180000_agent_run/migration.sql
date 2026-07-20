-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'running', 'awaiting_product_selection', 'awaiting_idea_selection', 'done', 'failed');

-- CreateEnum
CREATE TYPE "AgentRoute" AS ENUM ('DIRECT_PRODUCT', 'IDEATION_PIPELINE');

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "route" "AgentRoute",
    "currentStep" TEXT,
    "routerOutput" JSONB,
    "ideatorOutput" JSONB,
    "criticOutput" JSONB,
    "promptOutput" JSONB,
    "directProducts" JSONB,
    "chosenIdeaTitle" TEXT,
    "imageResultUrl" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_requestId_key" ON "AgentRun"("requestId");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
