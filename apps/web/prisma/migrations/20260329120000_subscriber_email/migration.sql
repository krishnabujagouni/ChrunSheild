-- Optional display email for merchant dashboard (Stripe customer id remains in subscriber_id)
ALTER TABLE "save_sessions" ADD COLUMN IF NOT EXISTS "subscriber_email" VARCHAR(320);
