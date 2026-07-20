-- New users start with 0 credits (no registration welcome bonus).
ALTER TABLE "user" ALTER COLUMN "credits" SET DEFAULT 0;
