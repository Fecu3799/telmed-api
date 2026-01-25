/*
  Warnings:

  - You are about to drop the column `notes` on the `consultations` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `consultations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "consultations" DROP COLUMN "notes",
DROP COLUMN "summary";
