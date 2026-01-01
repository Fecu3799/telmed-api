-- Add reason to appointments
ALTER TABLE "appointments" ADD COLUMN "reason" TEXT;

-- Add entry type enum and column
CREATE TYPE "ConsultationQueueEntryType" AS ENUM ('appointment', 'emergency');

ALTER TABLE "consultation_queue_items"
ADD COLUMN "entry_type" "ConsultationQueueEntryType" NOT NULL DEFAULT 'emergency'::"ConsultationQueueEntryType";

-- Extend payment status enum
ALTER TYPE "ConsultationQueuePaymentStatus" ADD VALUE 'not_required';

