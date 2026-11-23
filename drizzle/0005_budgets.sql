CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount_sen" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_shape" CHECK ("budgets"."amount_sen" >= 0 and ("budgets"."month" = '*' or "budgets"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'))
);
--> statement-breakpoint
CREATE TABLE "income_plans" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"amount_sen" bigint NOT NULL,
	CONSTRAINT "income_plans_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "income_plans_shape" CHECK ("income_plans"."amount_sen" >= 0 and ("income_plans"."month" = '*' or "income_plans"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'))
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_plans" ADD CONSTRAINT "income_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_one" ON "budgets" USING btree ("user_id","category_id","month");