DROP INDEX IF EXISTS "transactions_import_batch";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "import_batch_id";
ALTER TABLE "money_accounts" DROP COLUMN IF EXISTS "import_batch_id";
DROP TABLE IF EXISTS "import_batches";
