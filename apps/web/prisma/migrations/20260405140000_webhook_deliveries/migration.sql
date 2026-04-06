-- Webhook delivery logs (per endpoint, for dashboard "View logs")

CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_endpoint_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "http_status" INTEGER,
    "error_message" TEXT,
    "response_preview" VARCHAR(512),
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "duration_ms" INTEGER,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_deliveries_webhook_endpoint_id_created_at_idx" ON "webhook_deliveries"("webhook_endpoint_id", "created_at" DESC);
CREATE INDEX "webhook_deliveries_tenant_id_idx" ON "webhook_deliveries"("tenant_id");

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
