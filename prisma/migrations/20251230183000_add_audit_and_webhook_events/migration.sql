-- Create enums and tables for audit logging and webhook idempotency.
-- Separated as a structural-only migration to avoid P3006 on shadow DB.

CREATE TYPE "AuditAction" AS ENUM ('READ', 'WRITE', 'VERIFY', 'EXPORT', 'WEBHOOK');

CREATE TYPE "WebhookProvider" AS ENUM ('mercadopago');

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "action" "AuditAction" NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "actor_role" "UserRole",
  "trace_id" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

CREATE TABLE "webhook_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "provider" "WebhookProvider" NOT NULL,
  "event_id" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "trace_id" TEXT,

  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

CREATE INDEX "webhook_events_provider_received_at_idx" ON "webhook_events"("provider", "received_at");
