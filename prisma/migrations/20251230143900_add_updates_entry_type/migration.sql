-- Backfill entry_type based on appointment_id
UPDATE "consultation_queue_items"
SET "entry_type" = (CASE
  WHEN "appointment_id" IS NULL THEN 'emergency'
  ELSE 'appointment'
END)::"ConsultationQueueEntryType";

-- For appointment entries, mark payment as not_required
UPDATE "consultation_queue_items"
SET "payment_status" = 'not_required'::"ConsultationQueuePaymentStatus"
WHERE "appointment_id" IS NOT NULL;

-- Cache appointment reason into queue item when missing
UPDATE "consultation_queue_items" AS q
SET "reason" = a."reason"
FROM "appointments" AS a
WHERE q."appointment_id" = a."id"
  AND q."reason" IS NULL;

-- Enforce emergency reason
ALTER TABLE "consultation_queue_items"
ADD CONSTRAINT "consultation_queue_items_emergency_reason_chk"
CHECK (("appointment_id" IS NOT NULL) OR ("reason" IS NOT NULL));
