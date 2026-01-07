/*
  Warnings:

  - You are about to drop the `consultation_messages` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('text', 'system');

-- CreateEnum
CREATE TYPE "ChatParticipantRole" AS ENUM ('doctor', 'patient');

-- DropForeignKey
ALTER TABLE "consultation_messages" DROP CONSTRAINT "consultation_messages_consultation_id_fkey";

-- DropForeignKey
ALTER TABLE "consultation_messages" DROP CONSTRAINT "consultation_messages_file_id_fkey";

-- DropForeignKey
ALTER TABLE "consultation_messages" DROP CONSTRAINT "consultation_messages_sender_user_id_fkey";

-- DropTable
DROP TABLE "consultation_messages";

-- DropEnum
DROP TYPE "ConsultationMessageKind";

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" TEXT NOT NULL,
    "doctor_user_id" TEXT NOT NULL,
    "patient_user_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_policies" (
    "thread_id" TEXT NOT NULL,
    "patient_can_message" BOOLEAN NOT NULL DEFAULT true,
    "allowed_schedule" JSONB,
    "daily_limit" INTEGER NOT NULL DEFAULT 10,
    "burst_limit" INTEGER NOT NULL DEFAULT 3,
    "burst_window_seconds" INTEGER NOT NULL DEFAULT 30,
    "require_recent_consultation" BOOLEAN NOT NULL DEFAULT true,
    "recent_consultation_window_hours" INTEGER NOT NULL DEFAULT 72,
    "closed_by_doctor" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_policies_pkey" PRIMARY KEY ("thread_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "sender_role" "ChatParticipantRole" NOT NULL,
    "kind" "ChatMessageKind" NOT NULL,
    "text" TEXT,
    "client_message_id" TEXT,
    "context_consultation_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_threads_patient_user_id_last_message_at_idx" ON "chat_threads"("patient_user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chat_threads_doctor_user_id_last_message_at_idx" ON "chat_threads"("doctor_user_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_threads_doctor_user_id_patient_user_id_key" ON "chat_threads"("doctor_user_id", "patient_user_id");

-- CreateIndex
CREATE INDEX "chat_messages_thread_id_created_at_idx" ON "chat_messages"("thread_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chat_messages_thread_id_delivered_at_idx" ON "chat_messages"("thread_id", "delivered_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_thread_id_sender_user_id_client_message_id_key" ON "chat_messages"("thread_id", "sender_user_id", "client_message_id");

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_doctor_user_id_fkey" FOREIGN KEY ("doctor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_policies" ADD CONSTRAINT "chat_policies_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_context_consultation_id_fkey" FOREIGN KEY ("context_consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
