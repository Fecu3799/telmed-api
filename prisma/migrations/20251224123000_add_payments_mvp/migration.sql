-- Create payment enums
CREATE TYPE "PaymentProvider" AS ENUM ('mercadopago');
CREATE TYPE "PaymentKind" AS ENUM ('appointment', 'emergency');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'expired', 'refunded');
CREATE TYPE "ConsultationQueuePaymentStatus" AS ENUM ('not_started', 'pending', 'paid', 'failed', 'expired');

-- Appointment payment expiry
ALTER TABLE "appointments"
  ADD COLUMN "payment_expires_at" TIMESTAMP(3);

-- Queue payment status
ALTER TABLE "consultation_queue_items"
  ADD COLUMN "payment_status" "ConsultationQueuePaymentStatus" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "payment_expires_at" TIMESTAMP(3);

-- Payments table
CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "kind" "PaymentKind" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "doctor_user_id" TEXT NOT NULL,
  "patient_user_id" TEXT NOT NULL,
  "appointment_id" TEXT,
  "queue_item_id" TEXT,
  "checkout_url" TEXT NOT NULL,
  "provider_preference_id" TEXT NOT NULL,
  "provider_payment_id" TEXT,
  "idempotency_key" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_provider_preference_id_key" ON "payments"("provider_preference_id");
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");
CREATE UNIQUE INDEX "payments_appointment_id_key" ON "payments"("appointment_id");
CREATE UNIQUE INDEX "payments_queue_item_id_key" ON "payments"("queue_item_id");
CREATE UNIQUE INDEX "payments_patient_user_id_idempotency_key_kind_key" ON "payments"("patient_user_id", "idempotency_key", "kind");
CREATE INDEX "payments_doctor_user_id_status_idx" ON "payments"("doctor_user_id", "status");
CREATE INDEX "payments_patient_user_id_status_idx" ON "payments"("patient_user_id", "status");

ALTER TABLE "payments" ADD CONSTRAINT "payments_doctor_user_id_fkey" FOREIGN KEY ("doctor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "consultation_queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Doctor payment accounts
CREATE TABLE "doctor_payment_accounts" (
  "doctor_user_id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "mp_user_id" TEXT,
  "collector_id" TEXT,
  "access_token_encrypted" TEXT NOT NULL,
  "refresh_token_encrypted" TEXT NOT NULL,
  "token_expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "doctor_payment_accounts_pkey" PRIMARY KEY ("doctor_user_id")
);

ALTER TABLE "doctor_payment_accounts" ADD CONSTRAINT "doctor_payment_accounts_doctor_user_id_fkey" FOREIGN KEY ("doctor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
