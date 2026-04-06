-- Add pending_offer column to save_sessions
-- Stores the structured offer (type, pct, months) captured by the makeOffer tool call
-- so cancel-outcome can use server-side data instead of trusting client-sent offerType/discountPct
ALTER TABLE "save_sessions" ADD COLUMN "pending_offer" JSONB;
