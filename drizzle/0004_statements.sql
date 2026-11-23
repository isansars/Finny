ALTER TABLE "import_batches" ADD COLUMN "kind" text DEFAULT 'workbook' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "bank" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "period_from" date;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "period_to" date;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "file_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_file" ON "import_batches" USING btree ("user_id","file_hash") WHERE "import_batches"."file_hash" is not null;