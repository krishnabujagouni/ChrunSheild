ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "embed_app_id" VARCHAR(32);

UPDATE "tenants"
SET "embed_app_id" = 'cs_app_' || substr(replace(id::text, '-', ''), 1, 16)
WHERE "embed_app_id" IS NULL;

UPDATE "tenants"
SET "embed_hmac_secret" = lower(encode(gen_random_bytes(32), 'hex'))
WHERE "embed_hmac_secret" IS NULL OR btrim("embed_hmac_secret") = '';

ALTER TABLE "tenants" ALTER COLUMN "embed_app_id" SET NOT NULL;
ALTER TABLE "tenants" ALTER COLUMN "embed_hmac_secret" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_embed_app_id_key" ON "tenants"("embed_app_id");
