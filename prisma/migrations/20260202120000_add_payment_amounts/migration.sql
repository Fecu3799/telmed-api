-- Add platform fee and total charged fields for payments.
ALTER TABLE "payments"
ADD COLUMN "gross_amount_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "platform_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "total_charged_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "commission_rate_bps" INTEGER NOT NULL DEFAULT 1500;

-- Backfill amounts from legacy amount_cents (gross).
UPDATE "payments"
SET
  "gross_amount_cents" = "amount_cents",
  "platform_fee_cents" = CAST(ROUND(("amount_cents"::numeric) * 0.15) AS INTEGER),
  "total_charged_cents" = "amount_cents" + CAST(ROUND(("amount_cents"::numeric) * 0.15) AS INTEGER),
  "commission_rate_bps" = 1500;

-- Remove legacy amount column after backfill.
ALTER TABLE "payments" DROP COLUMN "amount_cents";
