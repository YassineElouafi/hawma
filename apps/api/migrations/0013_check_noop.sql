ALTER TABLE "booking"."booking" ADD COLUMN IF NOT EXISTS "slot_from" integer;--> statement-breakpoint
ALTER TABLE "booking"."booking" ADD COLUMN IF NOT EXISTS "slot_to" integer;