DROP TABLE IF EXISTS "things";
DROP TABLE IF EXISTS "account_values";
ALTER TABLE "money_accounts" DROP CONSTRAINT IF EXISTS "money_accounts_holding";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "maturity_on";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "rate_bp";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "holding_kind";
