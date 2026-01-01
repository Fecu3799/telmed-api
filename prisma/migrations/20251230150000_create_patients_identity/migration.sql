-- Migration split to avoid shadow DB enum/backfill issues (P3006).
-- Structural changes only: create patients table and rewire appointments.

-- Create enum for patient documents
CREATE TYPE "PatientDocumentType" AS ENUM ('DNI', 'PASSPORT', 'OTHER');

-- Create patients identity table
CREATE TABLE "patients" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "legal_first_name" TEXT NOT NULL,
  "legal_last_name" TEXT NOT NULL,
  "document_type" "PatientDocumentType" NOT NULL,
  "document_number" TEXT NOT NULL,
  "document_country" TEXT NOT NULL DEFAULT 'AR',
  "birth_date" DATE NOT NULL,
  "phone" TEXT,
  "address_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");
CREATE UNIQUE INDEX "patients_document_key"
ON "patients"("document_type", "document_country", "document_number");

ALTER TABLE "patients"
ADD CONSTRAINT "patients_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Rewire appointments to patient identity
ALTER TABLE "appointments" ADD COLUMN "patient_id" TEXT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey"
FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy patient_profiles relations before dropping table
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_patient_user_id_fkey";
DROP TABLE "patient_profiles";

-- Remove old patient_user_id column and index
DROP INDEX IF EXISTS "appointments_patient_user_id_start_at_idx";
ALTER TABLE "appointments" DROP COLUMN "patient_user_id";

-- Recreate patient index on new FK
CREATE INDEX "appointments_patient_id_start_at_idx"
ON "appointments"("patient_id", "start_at");
