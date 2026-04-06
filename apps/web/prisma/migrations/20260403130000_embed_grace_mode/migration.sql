-- Add embed_secret_activated flag to tenants.
-- While false (default), cancel-intent allows unsigned requests (grace mode).
-- Set to true when merchant first rotates/reveals their embed secret.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "embed_secret_activated" BOOLEAN NOT NULL DEFAULT FALSE;
