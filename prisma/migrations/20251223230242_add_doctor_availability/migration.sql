-- CreateEnum
CREATE TYPE "DoctorAvailabilityExceptionType" AS ENUM ('closed', 'custom');

-- CreateTable
CREATE TABLE "doctor_availability_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_availability_exceptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "DoctorAvailabilityExceptionType" NOT NULL,
    "custom_windows" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_scheduling_configs" (
    "user_id" TEXT NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "lead_time_hours" INTEGER NOT NULL DEFAULT 24,
    "horizon_days" INTEGER NOT NULL DEFAULT 60,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_scheduling_configs_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "doctor_availability_rules_user_id_idx" ON "doctor_availability_rules"("user_id");

-- CreateIndex
CREATE INDEX "doctor_availability_exceptions_user_id_date_idx" ON "doctor_availability_exceptions"("user_id", "date");

-- AddForeignKey
ALTER TABLE "doctor_availability_rules" ADD CONSTRAINT "doctor_availability_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_availability_exceptions" ADD CONSTRAINT "doctor_availability_exceptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_scheduling_configs" ADD CONSTRAINT "doctor_scheduling_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
