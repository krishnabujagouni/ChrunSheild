ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "embed_hmac_secret" VARCHAR(128);

ALTER TABLE "save_sessions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" VARCHAR(64);
