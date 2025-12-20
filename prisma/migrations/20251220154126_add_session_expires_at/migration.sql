/*
  Warnings:

  - Added the required column `expires_at` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "doctor_profiles_location_gist_idx";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "expires_at" TIMESTAMP(3) NOT NULL;
