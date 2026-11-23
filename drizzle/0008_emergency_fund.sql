CREATE TABLE "emergency_funds" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stability" text DEFAULT 'fair' NOT NULL,
	"dependents" integer DEFAULT 0 NOT NULL,
	"spending_sen" bigint,
	"target" text DEFAULT 'low' NOT NULL,
	"own_target_sen" bigint,
	"monthly_sen" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "emergency_funds_shape" CHECK ("emergency_funds"."dependents" between 0 and 3 and ("emergency_funds"."spending_sen" is null or "emergency_funds"."spending_sen" >= 0)
  and ("emergency_funds"."own_target_sen" is null or "emergency_funds"."own_target_sen" >= 0) and "emergency_funds"."monthly_sen" >= 0 and ("emergency_funds"."target" <> 'own' or "emergency_funds"."own_target_sen" is not null))
);
--> statement-breakpoint
CREATE TABLE "emergency_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"part_sen" bigint,
	CONSTRAINT "emergency_sources_part" CHECK ("emergency_sources"."part_sen" is null or "emergency_sources"."part_sen" >= 0)
);
--> statement-breakpoint
ALTER TABLE "emergency_funds" ADD CONSTRAINT "emergency_funds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_sources" ADD CONSTRAINT "emergency_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_sources" ADD CONSTRAINT "emergency_sources_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_sources_one" ON "emergency_sources" USING btree ("user_id","account_id");