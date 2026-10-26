CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
DROP INDEX "chats_tenant_updated_idx";--> statement-breakpoint
ALTER TABLE "chat_turns" DROP CONSTRAINT "chat_turns_chat_id_chats_id_fk";--> statement-breakpoint
ALTER TABLE "chat_turns" ALTER COLUMN "chat_id" SET DATA TYPE uuid USING "chat_id"::uuid;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_tenant_author_updated_idx" ON "chats" USING btree ("tenant_id","created_by","updated_at" DESC NULLS LAST);
