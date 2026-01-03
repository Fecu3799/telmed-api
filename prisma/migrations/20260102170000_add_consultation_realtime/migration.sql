-- Add consultation realtime metadata, messages, and file storage.
-- No backfills: structural-only to keep migrations P3006-safe.

-- CreateEnum
CREATE TYPE "ConsultationMessageKind" AS ENUM ('text', 'file', 'system');

-- AlterTable
ALTER TABLE "consultations"
  ADD COLUMN "video_provider" TEXT,
  ADD COLUMN "video_room_name" TEXT,
  ADD COLUMN "video_created_at" TIMESTAMP(3),
  ADD COLUMN "last_activity_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "file_objects" (
  "id" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT,
  "uploaded_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_messages" (
  "id" TEXT NOT NULL,
  "consultation_id" TEXT NOT NULL,
  "sender_user_id" TEXT NOT NULL,
  "kind" "ConsultationMessageKind" NOT NULL,
  "text" TEXT,
  "file_id" TEXT,
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "consultation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultation_messages_consultation_id_created_at_idx"
  ON "consultation_messages"("consultation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consultation_messages_consultation_id_delivered_at_idx"
  ON "consultation_messages"("consultation_id", "delivered_at");

-- CreateIndex
CREATE INDEX "file_objects_uploaded_by_user_id_created_at_idx"
  ON "file_objects"("uploaded_by_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "consultation_messages"
  ADD CONSTRAINT "consultation_messages_consultation_id_fkey"
  FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_messages"
  ADD CONSTRAINT "consultation_messages_sender_user_id_fkey"
  FOREIGN KEY ("sender_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_messages"
  ADD CONSTRAINT "consultation_messages_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "file_objects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects"
  ADD CONSTRAINT "file_objects_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
