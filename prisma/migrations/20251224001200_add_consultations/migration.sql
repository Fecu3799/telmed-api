-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('draft', 'in_progress', 'closed');

-- CreateTable
CREATE TABLE "consultations" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "doctor_user_id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'draft',
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "summary" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consultations_appointment_id_key" ON "consultations"("appointment_id");

-- CreateIndex
CREATE INDEX "consultations_doctor_user_id_created_at_idx" ON "consultations"("doctor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "consultations_patient_user_id_created_at_idx" ON "consultations"("patient_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
