-- AgentRun: убрали product selection / done, добавили idea_selected и conceptsOutput
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'idea_selected';

ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "conceptsOutput" JSONB;
