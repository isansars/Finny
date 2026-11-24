DROP INDEX IF EXISTS "transactions_client_ref";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "client_ref";
