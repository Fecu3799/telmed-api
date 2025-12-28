-- AddForeignKey
ALTER TABLE "consultation_queue_items"
ADD CONSTRAINT "consultation_queue_items_appointment_id_fkey"
FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
