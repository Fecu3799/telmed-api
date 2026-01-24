-- CreateTable
CREATE TABLE "patient_clinical_medications" (
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

    CONSTRAINT "patient_clinical_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_clinical_conditions" (
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

    CONSTRAINT "patient_clinical_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_clinical_procedures" (
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

    CONSTRAINT "patient_clinical_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_clinical_medications_patient_user_id_is_active_idx" ON "patient_clinical_medications"("patient_user_id", "is_active");

-- CreateIndex
CREATE INDEX "patient_clinical_medications_patient_user_id_verification_sta_idx" ON "patient_clinical_medications"("patient_user_id", "verification_status");

-- CreateIndex
CREATE INDEX "patient_clinical_conditions_patient_user_id_is_active_idx" ON "patient_clinical_conditions"("patient_user_id", "is_active");

-- CreateIndex
CREATE INDEX "patient_clinical_conditions_patient_user_id_verification_sta_idx" ON "patient_clinical_conditions"("patient_user_id", "verification_status");

-- CreateIndex
CREATE INDEX "patient_clinical_procedures_patient_user_id_is_active_idx" ON "patient_clinical_procedures"("patient_user_id", "is_active");

-- CreateIndex
CREATE INDEX "patient_clinical_procedures_patient_user_id_verification_sta_idx" ON "patient_clinical_procedures"("patient_user_id", "verification_status");
