-- Add and backfill token columns before db push on existing installations.
-- No attendance, employee or trip history is removed.
DO $$ BEGIN
 IF to_regclass('public."TrainingSession"') IS NOT NULL THEN
  ALTER TABLE "TrainingSession" ADD COLUMN IF NOT EXISTS "detailsToken" TEXT;
  UPDATE "TrainingSession" SET "detailsToken" = gen_random_uuid()::text WHERE "detailsToken" IS NULL;
  ALTER TABLE "TrainingSession" ALTER COLUMN "detailsToken" SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "TrainingSession_detailsToken_key" ON "TrainingSession"("detailsToken");
 END IF;
 IF to_regclass('public."TrainingCompletion"') IS NOT NULL THEN
  ALTER TABLE "TrainingCompletion" ADD COLUMN IF NOT EXISTS "reviewToken" TEXT;
  UPDATE "TrainingCompletion" SET "reviewToken" = gen_random_uuid()::text WHERE "reviewToken" IS NULL;
  ALTER TABLE "TrainingCompletion" ALTER COLUMN "reviewToken" SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "TrainingCompletion_reviewToken_key" ON "TrainingCompletion"("reviewToken");
  ALTER TABLE "TrainingCompletion" ADD COLUMN IF NOT EXISTS "summaryToken" TEXT;
  UPDATE "TrainingCompletion" SET "summaryToken" = gen_random_uuid()::text WHERE "summaryToken" IS NULL;
  ALTER TABLE "TrainingCompletion" ALTER COLUMN "summaryToken" SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "TrainingCompletion_summaryToken_key" ON "TrainingCompletion"("summaryToken");
 END IF;
END $$;
