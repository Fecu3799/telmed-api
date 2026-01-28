-- CreateEnum
CREATE TYPE "ClinicalNoteFormatJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ClinicalNoteFormatProposalVariant" AS ENUM ('A', 'B', 'C');

-- CreateTable
CREATE TABLE "clinical_note_format_jobs" (
    "id" TEXT NOT NULL,
    "final_note_id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "doctor_user_id" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "options" JSONB,
    "prompt_version" INTEGER NOT NULL,
    "input_hash" TEXT NOT NULL,
    "status" "ClinicalNoteFormatJobStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "model" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_note_format_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note_format_proposals" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "variant" "ClinicalNoteFormatProposalVariant" NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_format_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_note_format_jobs_final_note_id_status_idx" ON "clinical_note_format_jobs"("final_note_id", "status");

-- CreateIndex
CREATE INDEX "clinical_note_format_jobs_doctor_user_id_created_at_idx" ON "clinical_note_format_jobs"("doctor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "clinical_note_format_jobs_consultation_id_idx" ON "clinical_note_format_jobs"("consultation_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_note_format_jobs_input_hash_key" ON "clinical_note_format_jobs"("input_hash");

-- CreateIndex
CREATE INDEX "clinical_note_format_proposals_job_id_idx" ON "clinical_note_format_proposals"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_note_format_proposals_job_id_variant_key" ON "clinical_note_format_proposals"("job_id", "variant");

-- AddForeignKey
ALTER TABLE "clinical_note_format_jobs" ADD CONSTRAINT "clinical_note_format_jobs_final_note_id_fkey" FOREIGN KEY ("final_note_id") REFERENCES "clinical_episode_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_format_proposals" ADD CONSTRAINT "clinical_note_format_proposals_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "clinical_note_format_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
