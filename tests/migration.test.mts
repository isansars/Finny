// Applies every migration in ./drizzle to an empty in-memory database, then each down script in reverse, and checks
// the schema is empty again (every step is reversible: drizzle/down/<tag>.sql).
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const folder = path.join(process.cwd(), "drizzle");
const journal = JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
const pg = new PGlite();
await migrate(drizzle(pg), { migrationsFolder: folder });
const tables = async () => (await pg.query<{ t: string }>("select table_name as t from information_schema.tables where table_schema = 'public' order by 1")).rows.map((r) => r.t);
const up = await tables();
console.log("up:", up.join(", "));
for (const want of ["users", "sessions", "auth_accounts", "verification_tokens", "money_accounts", "categories", "entities", "transactions", "import_batches", "budgets", "income_plans"]) assert.ok(up.includes(want), `missing ${want}`);

// FINNY-26: the database itself refuses a malformed transaction (amounts in sen, transfers between two accounts, no category).
await pg.exec(`insert into users (id, email) values ('u1', 'owner@finny.test');
  insert into money_accounts (id, user_id, name, type, opening_on) values ('00000000-0000-0000-0000-00000000000a', 'u1', 'BCA', 'bank', '2026-11-01'), ('00000000-0000-0000-0000-00000000000b', 'u1', 'GoPay', 'ewallet', '2026-11-01');
  insert into categories (id, user_id, kind, name) values ('00000000-0000-0000-0000-0000000000c1', 'u1', 'expense', 'Beli Kopi');`);
const A = "'00000000-0000-0000-0000-00000000000a'", B = "'00000000-0000-0000-0000-00000000000b'", K = "'00000000-0000-0000-0000-0000000000c1'";
const ins = (cols: string, vals: string) => pg.exec(`insert into transactions (user_id, "on", ${cols}) values ('u1', '2026-11-22', ${vals})`);
await ins("kind, amount_sen, account_id, category_id", `'spend', 4389000, ${A}, ${K}`);
await ins("kind, amount_sen, account_id, to_account_id", `'transfer', 10000000, ${A}, ${B}`);
const refused = async (label: string, p: Promise<unknown>) => { await assert.rejects(p, undefined, label); };
await refused("transfer to the same account", ins("kind, amount_sen, account_id, to_account_id", `'transfer', 100, ${A}, ${A}`));
await refused("transfer with a category", ins("kind, amount_sen, account_id, to_account_id, category_id", `'transfer', 100, ${A}, ${B}, ${K}`));
await refused("spend without a category", ins("kind, amount_sen, account_id", `'spend', 100, ${A}`));
await refused("spend to a second account", ins("kind, amount_sen, account_id, to_account_id, category_id", `'spend', 100, ${A}, ${B}, ${K}`));
await refused("zero amount", ins("kind, amount_sen, account_id, category_id", `'spend', 0, ${A}, ${K}`));
const big = (await pg.query<{ s: string }>("select sum(amount_sen)::text as s from transactions")).rows[0].s;
assert.equal(big, "14389000", "amounts are exact integers");
console.log("✓ the transactions table refuses malformed rows");
// FINNY-69: one statement file is saved once per owner; workbook batches have no file hash and never clash.
await pg.exec(`insert into import_batches (user_id, source) values ('u1', 'workbook'), ('u1', 'workbook')`);
await pg.exec(`insert into import_batches (user_id, source, kind, bank, file_hash) values ('u1', 'statement', 'statement', 'bca', 'h1')`);
await refused("the same statement twice", pg.exec(`insert into import_batches (user_id, source, kind, bank, file_hash) values ('u1', 'statement', 'statement', 'bca', 'h1')`));
const kinds = (await pg.query<{ k: string }>("select kind as k from import_batches order by created_at, kind")).rows.map((r) => r.k).sort();
assert.deepEqual(kinds, ["statement", "workbook", "workbook"], "existing batches default to workbook");
console.log("✓ a statement file is saved once");
// FINNY-60: one budget per category and month (or "*" for every month), amounts in sen, never negative.
await pg.exec(`insert into budgets (user_id, category_id, month, amount_sen) values ('u1', ${K}, '2026-11', 50000000), ('u1', ${K}, '*', 45000000)`);
await refused("two budgets for one month", pg.exec(`insert into budgets (user_id, category_id, month, amount_sen) values ('u1', ${K}, '2026-11', 1)`));
await refused("a month that isn't one", pg.exec(`insert into budgets (user_id, category_id, month, amount_sen) values ('u1', ${K}, '2026-13', 1)`));
await refused("a negative budget", pg.exec(`insert into budgets (user_id, category_id, month, amount_sen) values ('u1', ${K}, '2026-12', -1)`));
await pg.exec(`insert into income_plans (user_id, month, amount_sen) values ('u1', '2026-11', 1500000000)`);
await refused("two income plans for one month", pg.exec(`insert into income_plans (user_id, month, amount_sen) values ('u1', '2026-11', 1)`));
console.log("✓ budgets and income plans keep their shape");
await pg.exec("delete from budgets; delete from income_plans;");
await pg.exec("delete from import_batches;");
await pg.exec("delete from transactions; delete from categories; delete from money_accounts; delete from users;");
for (const { tag } of [...journal.entries].reverse()) {
  const down = path.join(folder, "down", `${tag}.sql`);
  assert.ok(existsSync(down), `no down script for ${tag} (drizzle/down/${tag}.sql)`);
  await pg.exec(readFileSync(down, "utf8"));
}
assert.deepEqual(await tables(), [], "down scripts leave tables behind");
console.log(`✓ ${journal.entries.length} migration(s) applied and rolled back`);
await pg.close();
