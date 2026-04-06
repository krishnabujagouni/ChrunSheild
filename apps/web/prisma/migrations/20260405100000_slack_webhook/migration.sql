-- Add slack_webhook_url to tenants for Slack save/high-risk alerts
ALTER TABLE "tenants" ADD COLUMN "slack_webhook_url" TEXT;
