-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('cancel_attempt', 'payment_failed', 'prediction_outreach');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "clerk_org_id" TEXT,
    "stripe_connect_id" TEXT,
    "snippet_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "stripe_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "save_sessions" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "trigger_type" "TriggerType" NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "subscription_mrr" DECIMAL(12,2) NOT NULL,
    "offer_made" TEXT,
    "offer_accepted" BOOLEAN NOT NULL DEFAULT false,
    "outcome_confirmed_at" TIMESTAMP(3),
    "saved_value" DECIMAL(12,2),
    "fee_charged" DECIMAL(12,2),
    "transcript" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "save_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerk_org_id_key" ON "tenants"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripe_connect_id_key" ON "tenants"("stripe_connect_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_snippet_key_key" ON "tenants"("snippet_key");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_events_stripe_event_id_key" ON "stripe_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_events_type_idx" ON "stripe_events"("type");

-- CreateIndex
CREATE INDEX "stripe_events_tenant_id_idx" ON "stripe_events"("tenant_id");

-- CreateIndex
CREATE INDEX "stripe_events_received_at_idx" ON "stripe_events"("received_at");

-- CreateIndex
CREATE INDEX "save_sessions_tenant_id_created_at_idx" ON "save_sessions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "save_sessions_subscriber_id_idx" ON "save_sessions"("subscriber_id");

-- AddForeignKey
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "save_sessions" ADD CONSTRAINT "save_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
