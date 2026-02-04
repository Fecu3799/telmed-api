-- Create enums for doctor payment account dev mode
CREATE TYPE "DoctorPaymentAccountMode" AS ENUM ('dev');
CREATE TYPE "DoctorPaymentAccountStatus" AS ENUM (
  'not_configured',
  'connected',
  'disconnected'
);

ALTER TABLE "doctor_payment_accounts"
  ADD COLUMN "mode" "DoctorPaymentAccountMode" NOT NULL DEFAULT 'dev',
  ADD COLUMN "status" "DoctorPaymentAccountStatus" NOT NULL DEFAULT 'not_configured',
  ADD COLUMN "dev_label" TEXT,
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ALTER COLUMN "provider" SET DEFAULT 'mercadopago',
  ALTER COLUMN "access_token_encrypted" DROP NOT NULL,
  ALTER COLUMN "refresh_token_encrypted" DROP NOT NULL,
  ALTER COLUMN "token_expires_at" DROP NOT NULL;

-- Backfill status for existing real accounts (if any)
UPDATE "doctor_payment_accounts"
SET "status" = 'connected'
WHERE "access_token_encrypted" IS NOT NULL;
