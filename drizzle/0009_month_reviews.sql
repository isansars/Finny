CREATE TABLE "month_reviews" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"budget_done" boolean DEFAULT false NOT NULL,
	"wealth_done" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp,
	"note" text,
	"summary" jsonb,
	CONSTRAINT "month_reviews_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "month_reviews_shape" CHECK ("month_reviews"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and ("month_reviews"."note" is null or length("month_reviews"."note") <= 1000))
);
--> statement-breakpoint
ALTER TABLE "month_reviews" ADD CONSTRAINT "month_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;