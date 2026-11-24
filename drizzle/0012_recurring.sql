CREATE TABLE "recurring" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"amount_sen" bigint,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"every" text NOT NULL,
	"anchor_on" date NOT NULL,
	"end_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_amount" CHECK ("recurring"."amount_sen" is null or "recurring"."amount_sen" > 0),
	CONSTRAINT "recurring_name" CHECK (length("recurring"."name") between 1 and 60),
	CONSTRAINT "recurring_end" CHECK ("recurring"."end_on" is null or "recurring"."end_on" >= "recurring"."anchor_on"),
	CONSTRAINT "recurring_shape" CHECK (("recurring"."kind" = 'transfer' and "recurring"."to_account_id" is not null and "recurring"."to_account_id" <> "recurring"."account_id" and "recurring"."category_id" is null)
    or ("recurring"."kind" <> 'transfer' and "recurring"."to_account_id" is null and "recurring"."category_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "recurring_dismissed" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "recurring_dismissed_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "recurring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"txn_id" uuid,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_to_account_id_money_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."money_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_dismissed" ADD CONSTRAINT "recurring_dismissed_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_recurring_id_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_user" ON "recurring" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_runs_one" ON "recurring_runs" USING btree ("recurring_id","due_on");