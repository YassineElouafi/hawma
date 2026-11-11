-- Slot bookings: columns for the absolute slot range plus an EXCLUSION constraint so two active bookings
-- for the same provider can never overlap, even under concurrent requests (the database is the arbiter).
ALTER TABLE booking.booking ADD COLUMN IF NOT EXISTS slot_from integer;
--> statement-breakpoint
ALTER TABLE booking.booking ADD COLUMN IF NOT EXISTS slot_to integer;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE booking.booking ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (provider_id WITH =, int4range(slot_from, slot_to) WITH &&)
  WHERE (slot_from IS NOT NULL AND slot_to IS NOT NULL AND state NOT IN ('Declined', 'Expired', 'Cancelled', 'Refunded'));
