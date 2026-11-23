CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"txns" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"accounts" integer DEFAULT 0 NOT NULL,
	"categories" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_user" ON "import_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_import_batch" ON "transactions" USING btree ("import_batch_id");