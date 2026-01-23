-- Ensure doctor_profiles rows exist for doctor-only tables before repointing FKs.
DO $$
BEGIN
  IF to_regclass('public.doctor_profiles') IS NOT NULL
     AND to_regclass('public.doctor_availability_rules') IS NOT NULL THEN
    INSERT INTO "doctor_profiles" ("user_id", "price_cents", "is_active")
    SELECT DISTINCT u."id", 0, false
    FROM "doctor_availability_rules" dar
    JOIN "users" u ON u."id" = dar."user_id"
    WHERE u."role" = 'doctor'
      AND NOT EXISTS (
        SELECT 1 FROM "doctor_profiles" dp WHERE dp."user_id" = u."id"
      )
    ON CONFLICT ("user_id") DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_profiles') IS NOT NULL
     AND to_regclass('public.doctor_availability_exceptions') IS NOT NULL THEN
    INSERT INTO "doctor_profiles" ("user_id", "price_cents", "is_active")
    SELECT DISTINCT u."id", 0, false
    FROM "doctor_availability_exceptions" dae
    JOIN "users" u ON u."id" = dae."user_id"
    WHERE u."role" = 'doctor'
      AND NOT EXISTS (
        SELECT 1 FROM "doctor_profiles" dp WHERE dp."user_id" = u."id"
      )
    ON CONFLICT ("user_id") DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_profiles') IS NOT NULL
     AND to_regclass('public.doctor_scheduling_configs') IS NOT NULL THEN
    INSERT INTO "doctor_profiles" ("user_id", "price_cents", "is_active")
    SELECT DISTINCT u."id", 0, false
    FROM "doctor_scheduling_configs" dsc
    JOIN "users" u ON u."id" = dsc."user_id"
    WHERE u."role" = 'doctor'
      AND NOT EXISTS (
        SELECT 1 FROM "doctor_profiles" dp WHERE dp."user_id" = u."id"
      )
    ON CONFLICT ("user_id") DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_profiles') IS NOT NULL
     AND to_regclass('public.doctor_payment_accounts') IS NOT NULL THEN
    INSERT INTO "doctor_profiles" ("user_id", "price_cents", "is_active")
    SELECT DISTINCT u."id", 0, false
    FROM "doctor_payment_accounts" dpa
    JOIN "users" u ON u."id" = dpa."doctor_user_id"
    WHERE u."role" = 'doctor'
      AND NOT EXISTS (
        SELECT 1 FROM "doctor_profiles" dp WHERE dp."user_id" = u."id"
      )
    ON CONFLICT ("user_id") DO NOTHING;
  END IF;
END $$;

-- Guardrails: prevent FK repointing if orphan rows remain.
DO $$
BEGIN
  IF to_regclass('public.doctor_availability_rules') IS NOT NULL
     AND to_regclass('public.doctor_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "doctor_availability_rules" dar
      LEFT JOIN "doctor_profiles" dp ON dp."user_id" = dar."user_id"
      WHERE dp."user_id" IS NULL
    ) THEN
      RAISE EXCEPTION 'doctor_availability_rules has user_id without doctor_profiles';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_availability_exceptions') IS NOT NULL
     AND to_regclass('public.doctor_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "doctor_availability_exceptions" dae
      LEFT JOIN "doctor_profiles" dp ON dp."user_id" = dae."user_id"
      WHERE dp."user_id" IS NULL
    ) THEN
      RAISE EXCEPTION 'doctor_availability_exceptions has user_id without doctor_profiles';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_scheduling_configs') IS NOT NULL
     AND to_regclass('public.doctor_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "doctor_scheduling_configs" dsc
      LEFT JOIN "doctor_profiles" dp ON dp."user_id" = dsc."user_id"
      WHERE dp."user_id" IS NULL
    ) THEN
      RAISE EXCEPTION 'doctor_scheduling_configs has user_id without doctor_profiles';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_payment_accounts') IS NOT NULL
     AND to_regclass('public.doctor_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "doctor_payment_accounts" dpa
      LEFT JOIN "doctor_profiles" dp ON dp."user_id" = dpa."doctor_user_id"
      WHERE dp."user_id" IS NULL
    ) THEN
      RAISE EXCEPTION 'doctor_payment_accounts has doctor_user_id without doctor_profiles';
    END IF;
  END IF;
END $$;

-- Repoint foreign keys to doctor_profiles (user_id).
DO $$
BEGIN
  IF to_regclass('public.doctor_availability_rules') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'doctor_availability_rules_user_id_fkey'
    ) THEN
      ALTER TABLE "doctor_availability_rules"
        DROP CONSTRAINT "doctor_availability_rules_user_id_fkey";
    END IF;

    IF to_regclass('public.doctor_profiles') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_availability_rules_user_id_fkey'
      ) THEN
        ALTER TABLE "doctor_availability_rules"
          ADD CONSTRAINT "doctor_availability_rules_user_id_fkey"
          FOREIGN KEY ("user_id")
          REFERENCES "doctor_profiles"("user_id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_availability_exceptions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'doctor_availability_exceptions_user_id_fkey'
    ) THEN
      ALTER TABLE "doctor_availability_exceptions"
        DROP CONSTRAINT "doctor_availability_exceptions_user_id_fkey";
    END IF;

    IF to_regclass('public.doctor_profiles') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_availability_exceptions_user_id_fkey'
      ) THEN
        ALTER TABLE "doctor_availability_exceptions"
          ADD CONSTRAINT "doctor_availability_exceptions_user_id_fkey"
          FOREIGN KEY ("user_id")
          REFERENCES "doctor_profiles"("user_id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_scheduling_configs') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'doctor_scheduling_configs_user_id_fkey'
    ) THEN
      ALTER TABLE "doctor_scheduling_configs"
        DROP CONSTRAINT "doctor_scheduling_configs_user_id_fkey";
    END IF;

    IF to_regclass('public.doctor_profiles') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_scheduling_configs_user_id_fkey'
      ) THEN
        ALTER TABLE "doctor_scheduling_configs"
          ADD CONSTRAINT "doctor_scheduling_configs_user_id_fkey"
          FOREIGN KEY ("user_id")
          REFERENCES "doctor_profiles"("user_id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.doctor_payment_accounts') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'doctor_payment_accounts_doctor_user_id_fkey'
    ) THEN
      ALTER TABLE "doctor_payment_accounts"
        DROP CONSTRAINT "doctor_payment_accounts_doctor_user_id_fkey";
    END IF;

    IF to_regclass('public.doctor_profiles') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_payment_accounts_doctor_user_id_fkey'
      ) THEN
        ALTER TABLE "doctor_payment_accounts"
          ADD CONSTRAINT "doctor_payment_accounts_doctor_user_id_fkey"
          FOREIGN KEY ("doctor_user_id")
          REFERENCES "doctor_profiles"("user_id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;
