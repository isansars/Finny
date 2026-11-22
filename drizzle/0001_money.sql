CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"parent_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"emoji" text,
	"opening_sen" bigint DEFAULT 0 NOT NULL,
	"opening_on" date NOT NULL,
	"limit_sen" bigint,
	"statement_day" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_sen" > 0),
	CONSTRAINT "transactions_shape" CHECK (("transactions"."kind" = 'transfer' and "transactions"."to_account_id" is not null and "transactions"."to_account_id" <> "transactions"."account_id" and "transactions"."category_id" is null)
    or ("transactions"."kind" <> 'transfer' and "transactions"."to_account_id" is null and "transactions"."category_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_money_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."money_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_user" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entities_user" ON "entities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "money_accounts_user" ON "money_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_on" ON "transactions" USING btree ("user_id","on");--> statement-breakpoint
CREATE INDEX "transactions_user_account_on" ON "transactions" USING btree ("user_id","account_id","on");