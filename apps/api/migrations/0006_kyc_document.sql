CREATE TABLE "identity"."kyc_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."kyc_document" ADD CONSTRAINT "kyc_document_verification_id_verification_id_fk" FOREIGN KEY ("verification_id") REFERENCES "identity"."verification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kycdoc_verification_idx" ON "identity"."kyc_document" USING btree ("verification_id");