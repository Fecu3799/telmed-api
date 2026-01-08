-- CreateEnum
CREATE TYPE "PatientFileStatus" AS ENUM ('pending_upload', 'ready', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "PatientFileCategory" AS ENUM ('lab', 'image', 'prescription', 'other');

-- CreateTable
CREATE TABLE "patient_files" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "file_object_id" TEXT NOT NULL,
    "status" "PatientFileStatus" NOT NULL DEFAULT 'pending_upload',
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "category" "PatientFileCategory" NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "uploaded_by_user_id" TEXT NOT NULL,
    "uploaded_by_role" "UserRole" NOT NULL,
    "related_consultation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_files_file_object_id_key" ON "patient_files"("file_object_id");

-- CreateIndex
CREATE INDEX "patient_files_patient_id_created_at_idx" ON "patient_files"("patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "patient_files_patient_id_category_created_at_idx" ON "patient_files"("patient_id", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "patient_files_related_consultation_id_idx" ON "patient_files"("related_consultation_id");

-- AddForeignKey
ALTER TABLE "patient_files" ADD CONSTRAINT "patient_files_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_files" ADD CONSTRAINT "patient_files_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_files" ADD CONSTRAINT "patient_files_related_consultation_id_fkey" FOREIGN KEY ("related_consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
