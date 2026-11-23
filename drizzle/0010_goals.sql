CREATE TABLE "goal_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"part_sen" bigint,
	CONSTRAINT "goal_sources_part" CHECK ("goal_sources"."part_sen" is null or "goal_sources"."part_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"target_sen" bigint NOT NULL,
	"by_month" text,
	"icon" text DEFAULT 'target' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "goals_shape" CHECK ("goals"."target_sen" > 0 and length("goals"."name") between 1 and 60 and ("goals"."by_month" is null or "goals"."by_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'))
);
--> statement-breakpoint
ALTER TABLE "goal_sources" ADD CONSTRAINT "goal_sources_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_sources" ADD CONSTRAINT "goal_sources_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_sources_one" ON "goal_sources" USING btree ("goal_id","account_id");--> statement-breakpoint
CREATE INDEX "goals_user" ON "goals" USING btree ("user_id");