-- Additive, repeatable upgrade for existing HR databases.
-- Fresh installations have no TrainingSession table yet; Prisma creates it next.
-- A duplicate non-null token causes this statement to fail without changing data.
DO $$
BEGIN
  IF to_regclass('public."TrainingSession"') IS NOT NULL THEN
    ALTER TABLE public."TrainingSession"
      ADD COLUMN IF NOT EXISTS "attendanceToken" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "TrainingSession_attendanceToken_key"
      ON public."TrainingSession" ("attendanceToken");
  END IF;
END $$;
