-- Add closed_at for consultation queue items
ALTER TABLE "consultation_queue_items" ADD COLUMN "closed_at" TIMESTAMP(3);

-- Partial index for active queue items per doctor
CREATE INDEX "consultation_queue_items_doctor_active_idx"
ON "consultation_queue_items" ("doctor_user_id", "status")
WHERE "closed_at" IS NULL;
