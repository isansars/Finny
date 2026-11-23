DROP TABLE IF EXISTS "debt_plans";
ALTER TABLE "money_accounts" DROP CONSTRAINT IF EXISTS "money_accounts_terms";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "purpose";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "due_day";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "min_floor_sen";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "min_pct_bp";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "min_fixed_sen";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "interest_per";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "interest_bp";
