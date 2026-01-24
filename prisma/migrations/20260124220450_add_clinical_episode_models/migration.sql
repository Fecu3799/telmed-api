-- CreateEnum
CREATE TYPE "ClinicalEpisodeNoteKind" AS ENUM ('draft', 'final', 'addendum');

-- CreateTable
CREATE TABLE "clinical_episodes" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "doctor_user_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_episode_notes" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "kind" "ClinicalEpisodeNoteKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_role" "UserRole" NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_episode_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_episodes_consultation_id_key" ON "clinical_episodes"("consultation_id");

-- CreateIndex
CREATE INDEX "clinical_episodes_doctor_user_id_created_at_idx" ON "clinical_episodes"("doctor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "clinical_episodes_patient_user_id_created_at_idx" ON "clinical_episodes"("patient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "clinical_episode_notes_episode_id_kind_idx" ON "clinical_episode_notes"("episode_id", "kind");

-- CreateIndex
CREATE INDEX "clinical_episode_notes_created_by_user_id_created_at_idx" ON "clinical_episode_notes"("created_by_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "clinical_episodes" ADD CONSTRAINT "clinical_episodes_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_episode_notes" ADD CONSTRAINT "clinical_episode_notes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "patient_clinical_conditions_patient_user_id_verification_sta_id" RENAME TO "patient_clinical_conditions_patient_user_id_verification_st_idx";

-- RenameIndex
ALTER INDEX "patient_clinical_medications_patient_user_id_verification_sta_i" RENAME TO "patient_clinical_medications_patient_user_id_verification_s_idx";

-- RenameIndex
ALTER INDEX "patient_clinical_procedures_patient_user_id_verification_sta_id" RENAME TO "patient_clinical_procedures_patient_user_id_verification_st_idx";
