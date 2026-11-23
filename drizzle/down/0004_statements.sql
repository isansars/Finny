DROP INDEX IF EXISTS "import_batches_file";
ALTER TABLE "import_batches" DROP COLUMN IF EXISTS "file_hash";
ALTER TABLE "import_batches" DROP COLUMN IF EXISTS "period_to";
ALTER TABLE "import_batches" DROP COLUMN IF EXISTS "period_from";
ALTER TABLE "import_batches" DROP COLUMN IF EXISTS "bank";
ALTER TABLE "import_batches" DROP COLUMN IF EXISTS "account_id";
ALTER TABLE "import_batches" DROP COLUMN IF EXISTS "kind";
