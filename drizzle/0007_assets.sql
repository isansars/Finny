CREATE TABLE "account_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"on" date NOT NULL,
	"value_sen" bigint NOT NULL,
	CONSTRAINT "account_values_shape" CHECK ("account_values"."value_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "things" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"bought_on" date NOT NULL,
	"cost_sen" bigint NOT NULL,
	"yearly_bp" integer DEFAULT 0 NOT NULL,
	"share_bp" integer DEFAULT 10000 NOT NULL,
	"value_sen" bigint,
	"value_on" date,
	"sold_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "things_shape" CHECK ("things"."cost_sen" >= 0 and "things"."yearly_bp" between -10000 and 10000 and "things"."share_bp" between 1 and 10000
  and ("things"."value_sen" is null or "things"."value_sen" >= 0) and (("things"."value_sen" is null) = ("things"."value_on" is null)))
);
--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "holding_kind" text;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "rate_bp" integer;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "maturity_on" date;--> statement-breakpoint
ALTER TABLE "account_values" ADD CONSTRAINT "account_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_values" ADD CONSTRAINT "account_values_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "things" ADD CONSTRAINT "things_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_values_one" ON "account_values" USING btree ("account_id","on");--> statement-breakpoint
CREATE INDEX "things_user" ON "things" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_holding" CHECK ("money_accounts"."rate_bp" is null or "money_accounts"."rate_bp" between 0 and 100000);