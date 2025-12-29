-- Add rejected_by to consultation_queue_items
ALTER TABLE "consultation_queue_items"
ADD COLUMN "rejected_by" TEXT;
