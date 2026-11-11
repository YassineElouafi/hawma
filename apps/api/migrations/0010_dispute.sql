CREATE TABLE "booking"."dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"refund_centimes" integer,
	"resolution_note" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "booking"."dispute" ADD CONSTRAINT "dispute_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "booking"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispute_one_per_booking_uq" ON "booking"."dispute" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "dispute_status_idx" ON "booking"."dispute" USING btree ("status");