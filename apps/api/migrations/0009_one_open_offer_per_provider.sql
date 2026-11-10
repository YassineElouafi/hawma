-- Make the migration safe on databases that already contain open offers created before this rule existed:
-- expire stale ones, and where a provider somehow holds several, keep only the newest.
UPDATE booking.dispatch_offer SET status = 'expired' WHERE status = 'offered' AND expires_at < now();
--> statement-breakpoint
UPDATE booking.dispatch_offer SET status = 'expired'
WHERE status = 'offered' AND id NOT IN (SELECT DISTINCT ON (provider_id) id FROM booking.dispatch_offer WHERE status = 'offered' ORDER BY provider_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_one_open_per_provider ON booking.dispatch_offer (provider_id) WHERE status = 'offered';
