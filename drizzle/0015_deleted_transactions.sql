CREATE TABLE "deleted_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"undo_id" uuid NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL,
	"on" date NOT NULL,
	"kind" text NOT NULL,
	"amount_sen" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"entity_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"note" text,
	"import_batch_id" uuid,
	"client_ref" text,
	"looks_ok" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_transactions" ADD CONSTRAINT "deleted_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_transactions_undo" ON "deleted_transactions" USING btree ("user_id","undo_id");--> statement-breakpoint
CREATE INDEX "deleted_transactions_when" ON "deleted_transactions" USING btree ("user_id","deleted_at");