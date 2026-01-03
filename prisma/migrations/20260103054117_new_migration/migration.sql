/*
  Warnings:

  - Made the column `patient_id` on table `appointments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "patient_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "webhook_events" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "patients_document_key" RENAME TO "patients_document_type_document_country_document_number_key";
