CREATE SCHEMA "booking";
--> statement-breakpoint
CREATE SCHEMA "catalogue";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "money";
--> statement-breakpoint
CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TYPE "identity"."user_status" AS ENUM('active', 'suspended', 'banned');--> statement-breakpoint
CREATE TABLE "platform"."audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform"."audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"reason" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue"."availability_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking"."booking_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"actor" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking"."booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider_id" uuid,
	"offer_id" uuid,
	"mode" text DEFAULT 'catalogue' NOT NULL,
	"state" text DEFAULT 'Requested' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address_note" text,
	"total_centimes" integer DEFAULT 0 NOT NULL,
	"fee_centimes" integer DEFAULT 0 NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"recurring_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue"."category" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"name_i18n" jsonb NOT NULL,
	"required_tier" integer DEFAULT 1 NOT NULL,
	"default_mode" text DEFAULT 'catalogue' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"push_token" text,
	"fingerprint" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking"."dispatch_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money"."ledger_entry" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "money"."ledger_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"txn_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account" text NOT NULL,
	"owner_id" uuid,
	"amount_centimes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue"."service_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	"title_i18n" jsonb NOT NULL,
	"description_i18n" jsonb,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer DEFAULT 5000 NOT NULL,
	"pricing_model" text DEFAULT 'fixed' NOT NULL,
	"base_price_centimes" integer DEFAULT 0 NOT NULL,
	"recurring_allowed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform"."outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "money"."payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_centimes" integer NOT NULL,
	"gateway_ref" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money"."payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"amount_centimes" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identity"."provider_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"kyc_tier" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rating_avg" double precision DEFAULT 0 NOT NULL,
	"jobs_completed" integer DEFAULT 0 NOT NULL,
	"acceptance" double precision DEFAULT 1 NOT NULL,
	"cancel_rate" double precision DEFAULT 0 NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking"."review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"refresh_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"status" "identity"."user_status" DEFAULT 'active' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reason" text,
	"reviewer_id" uuid,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "booking"."booking_event" ADD CONSTRAINT "booking_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "booking"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."device" ADD CONSTRAINT "device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking"."dispatch_offer" ADD CONSTRAINT "dispatch_offer_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "booking"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue"."service_offer" ADD CONSTRAINT "service_offer_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "catalogue"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."provider_profile" ADD CONSTRAINT "provider_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking"."review" ADD CONSTRAINT "review_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "booking"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."verification" ADD CONSTRAINT "verification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avail_provider_idx" ON "catalogue"."availability_rule" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "bevt_booking_idx" ON "booking"."booking_event" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_customer_idx" ON "booking"."booking" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "booking_provider_idx" ON "booking"."booking" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "booking_state_idx" ON "booking"."booking" USING btree ("state");--> statement-breakpoint
CREATE INDEX "device_user_idx" ON "identity"."device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "doffer_booking_idx" ON "booking"."dispatch_offer" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ledger_txn_idx" ON "money"."ledger_entry" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "ledger_acct_idx" ON "money"."ledger_entry" USING btree ("account","owner_id");--> statement-breakpoint
CREATE INDEX "offer_provider_idx" ON "catalogue"."service_offer" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "offer_category_idx" ON "catalogue"."service_offer" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "platform"."outbox" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_idem_uq" ON "money"."payment" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "review_once_uq" ON "booking"."review" USING btree ("booking_id","author_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "identity"."session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_phone_uq" ON "identity"."user" USING btree ("phone_e164");