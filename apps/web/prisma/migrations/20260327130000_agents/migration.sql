-- CreateTable: churn_predictions
CREATE TABLE "churn_predictions" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID         NOT NULL,
    "subscriber_id" TEXT         NOT NULL,
    "risk_score"    DECIMAL(5,4) NOT NULL,
    "risk_class"    TEXT         NOT NULL,
    "features"      JSONB,
    "predicted_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "churn_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: feedback_digests
CREATE TABLE "feedback_digests" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL,
    "period_days"      INTEGER      NOT NULL,
    "transcript_count" INTEGER      NOT NULL,
    "clusters"         JSONB,
    "digest_text"      TEXT         NOT NULL,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_retries
CREATE TABLE "payment_retries" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID,
    "stripe_event_id" TEXT        NOT NULL,
    "invoice_id"     TEXT,
    "customer_id"    TEXT,
    "customer_email" TEXT,
    "failure_class"  TEXT         NOT NULL,
    "delay_hours"    INTEGER[]    NOT NULL DEFAULT '{}',
    "next_retry_at"  TIMESTAMP(3),
    "attempts"       INTEGER      NOT NULL DEFAULT 0,
    "max_attempts"   INTEGER      NOT NULL DEFAULT 0,
    "status"         TEXT         NOT NULL DEFAULT 'pending',
    "last_error"     TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_retries_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "churn_predictions_tenant_id_subscriber_id_key"
    ON "churn_predictions"("tenant_id", "subscriber_id");

CREATE UNIQUE INDEX "payment_retries_stripe_event_id_key"
    ON "payment_retries"("stripe_event_id");

-- Supporting indexes
CREATE INDEX "churn_predictions_tenant_id_risk_class_idx"
    ON "churn_predictions"("tenant_id", "risk_class");

CREATE INDEX "feedback_digests_tenant_id_created_at_idx"
    ON "feedback_digests"("tenant_id", "created_at");

CREATE INDEX "payment_retries_status_next_retry_at_idx"
    ON "payment_retries"("status", "next_retry_at");

CREATE INDEX "payment_retries_tenant_id_idx"
    ON "payment_retries"("tenant_id");

-- Foreign keys
ALTER TABLE "churn_predictions"
    ADD CONSTRAINT "churn_predictions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_digests"
    ADD CONSTRAINT "feedback_digests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_retries"
    ADD CONSTRAINT "payment_retries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
