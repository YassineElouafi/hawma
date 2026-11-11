CREATE TABLE "platform"."backup_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform"."backup_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"file" text,
	"bytes" bigint,
	"ok" boolean NOT NULL,
	"error" text
);
