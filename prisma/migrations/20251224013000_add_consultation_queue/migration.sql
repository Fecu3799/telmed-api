-- CreateEnum
CREATE TYPE "ConsultationQueueStatus" AS ENUM ('queued', 'accepted', 'cancelled', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "consultation_queue_items" (
    "id" TEXT NOT NULL,
    "status" "ConsultationQueueStatus" NOT NULL DEFAULT 'queued',
    "doctor_user_id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "accepted_by" TEXT,
    "cancelled_by" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consultation_queue_items_appointment_id_key" ON "consultation_queue_items"("appointment_id");

-- CreateIndex
CREATE INDEX "consultation_queue_items_doctor_user_id_status_idx" ON "consultation_queue_items"("doctor_user_id", "status");

-- CreateIndex
CREATE INDEX "consultation_queue_items_patient_user_id_status_idx" ON "consultation_queue_items"("patient_user_id", "status");
