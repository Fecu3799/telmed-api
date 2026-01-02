-- Allow consultations to originate from appointments or queue items (emergency).
-- XOR constraint enforces exactly one source for each consultation.

ALTER TABLE "consultations" ALTER COLUMN "appointment_id" DROP NOT NULL;
ALTER TABLE "consultations" ADD COLUMN "queue_item_id" TEXT;

ALTER TABLE "consultations" DROP CONSTRAINT "consultations_appointment_id_fkey";
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "consultations_queue_item_id_key" ON "consultations"("queue_item_id");

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_queue_item_id_fkey"
  FOREIGN KEY ("queue_item_id") REFERENCES "consultation_queue_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_source_xor_check"
  CHECK (
    ("appointment_id" IS NOT NULL AND "queue_item_id" IS NULL)
    OR ("appointment_id" IS NULL AND "queue_item_id" IS NOT NULL)
  );
