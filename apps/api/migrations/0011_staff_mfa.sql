ALTER TABLE "platform"."staff_user" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "platform"."staff_user" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."staff_user" ADD COLUMN "mfa_recovery" jsonb DEFAULT '[]'::jsonb NOT NULL;