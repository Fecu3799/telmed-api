-- CreateEnum
CREATE TYPE "ClinicalSourceType" AS ENUM ('patient', 'clinician', 'system');

-- CreateEnum
CREATE TYPE "ClinicalVerificationStatus" AS ENUM ('unverified', 'verified', 'disputed');

-- CreateTable
CREATE TABLE "patient_clinical_allergies" (
    "id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "source_type" "ClinicalSourceType" NOT NULL DEFAULT 'patient',
    "source_user_id" TEXT,
    "verification_status" "ClinicalVerificationStatus" NOT NULL DEFAULT 'unverified',
    "verified_by_user_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "ended_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_clinical_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_clinical_allergies_patient_user_id_is_active_idx" ON "patient_clinical_allergies"("patient_user_id", "is_active");

-- CreateIndex
CREATE INDEX "patient_clinical_allergies_patient_user_id_verification_sta_idx" ON "patient_clinical_allergies"("patient_user_id", "verification_status");
