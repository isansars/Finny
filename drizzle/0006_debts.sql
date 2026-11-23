CREATE TABLE "debt_plans" (
	"user_id" text PRIMARY KEY NOT NULL,
	"method" text DEFAULT 'snowball' NOT NULL,
	"extra_sen" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "debt_plans_extra" CHECK ("debt_plans"."extra_sen" >= 0)
);
--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "interest_bp" integer;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "interest_per" text;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "min_fixed_sen" bigint;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "min_pct_bp" integer;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "min_floor_sen" bigint;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "due_day" integer;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "debt_plans" ADD CONSTRAINT "debt_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_terms" CHECK (("money_accounts"."interest_bp" is null or "money_accounts"."interest_bp" between 0 and 100000)
    and ("money_accounts"."min_fixed_sen" is null or "money_accounts"."min_fixed_sen" >= 0) and ("money_accounts"."min_pct_bp" is null or "money_accounts"."min_pct_bp" between 0 and 10000)
    and ("money_accounts"."min_floor_sen" is null or "money_accounts"."min_floor_sen" >= 0) and ("money_accounts"."due_day" is null or "money_accounts"."due_day" between 1 and 31)
    and ("money_accounts"."statement_day" is null or "money_accounts"."statement_day" between 1 and 31));