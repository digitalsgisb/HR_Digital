-- Additive, repeatable upgrade for existing HR databases.
-- Adds the personal trip-link token before db push, which otherwise stops on its
-- unique-index warning and keeps the API from starting.
-- Fresh installations have no VehicleTrip table yet; Prisma creates it next.
-- Existing trips get NULL (no link); the server backfills open trips on lookup.
DO $$
BEGIN
  IF to_regclass('public."VehicleTrip"') IS NOT NULL THEN
    ALTER TABLE public."VehicleTrip"
      ADD COLUMN IF NOT EXISTS "resumeToken" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "VehicleTrip_resumeToken_key"
      ON public."VehicleTrip" ("resumeToken");
  END IF;
END $$;
