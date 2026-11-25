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
for (const want of ["users", "sessions", "auth_accounts", "verification_tokens", "money_accounts", "categories", "entities", "transactions", "import_batches", "budgets", "income_plans", "debt_plans", "account_values", "things", "emergency_funds", "emergency_sources", "month_reviews", "goals", "goal_sources", "recurring", "recurring_runs", "recurring_dismissed", "deleted_transactions"]) assert.ok(up.includes(want), `missing ${want}`);

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
// FINNY-85: a card's terms stay in range; one payoff plan per owner, never a negative extra.
await pg.exec(`update money_accounts set interest_bp = 175, interest_per = 'month', min_pct_bp = 1000, min_floor_sen = 5000000, due_day = 5, statement_day = 20, purpose = 'consumptive' where id = ${A}`);
await refused("a due day of 32", pg.exec(`update money_accounts set due_day = 32 where id = ${A}`));
await refused("a negative minimum", pg.exec(`update money_accounts set min_fixed_sen = -1 where id = ${A}`));
await refused("a minimum over 100%", pg.exec(`update money_accounts set min_pct_bp = 10001 where id = ${A}`));
await pg.exec(`insert into debt_plans (user_id, method, extra_sen) values ('u1', 'avalanche', 50000000)`);
await refused("two plans for one owner", pg.exec(`insert into debt_plans (user_id) values ('u1')`));
await refused("a negative extra", pg.exec(`update debt_plans set extra_sen = -1`));
console.log("✓ debt terms and the payoff plan keep their shape");
// FINNY-93: one market value per account and day, never negative; a thing's value comes with its date.
await pg.exec(`update money_accounts set holding_kind = 'fund', rate_bp = 650 where id = ${B}`);
await pg.exec(`insert into account_values (user_id, account_id, "on", value_sen) values ('u1', ${B}, '2026-11-20', 1840000000)`);
await refused("two values on one day", pg.exec(`insert into account_values (user_id, account_id, "on", value_sen) values ('u1', ${B}, '2026-11-20', 1)`));
await refused("a negative value", pg.exec(`insert into account_values (user_id, account_id, "on", value_sen) values ('u1', ${B}, '2026-11-21', -1)`));
await pg.exec(`insert into things (user_id, name, kind, bought_on, cost_sen, yearly_bp) values ('u1', 'Motor', 'vehicle', '2024-11-12', 2400000000, -1200)`);
await refused("a value without its date", pg.exec(`insert into things (user_id, name, kind, bought_on, cost_sen, value_sen) values ('u1', 'X', 'other', '2024-01-01', 1, 5)`));
await refused("a share over 100%", pg.exec(`insert into things (user_id, name, kind, bought_on, cost_sen, share_bp) values ('u1', 'X', 'business', '2024-01-01', 1, 10001)`));
console.log("✓ market values and things keep their shape");
// FINNY-101: one fund per owner; dependents 0–3; "own" needs an amount; one source per account.
await pg.exec(`insert into emergency_funds (user_id, stability, dependents, monthly_sen) values ('u1', 'fair', 1, 200000000)`);
await refused("two funds for one owner", pg.exec(`insert into emergency_funds (user_id) values ('u1')`));
await refused("four dependents", pg.exec(`update emergency_funds set dependents = 4`));
await refused("an own target without an amount", pg.exec(`update emergency_funds set target = 'own'`));
await pg.exec(`insert into emergency_sources (user_id, account_id, part_sen) values ('u1', ${A}, 200000000)`);
await refused("the same account twice", pg.exec(`insert into emergency_sources (user_id, account_id) values ('u1', ${A})`));
await refused("a negative part", pg.exec(`insert into emergency_sources (user_id, account_id, part_sen) values ('u1', ${B}, -1)`));
console.log("✓ the emergency fund and its sources keep their shape");
await pg.exec(`insert into month_reviews (user_id, month, budget_done, note, summary) values ('u1', '2026-10', true, 'ok', '{"keptSen": 100}')`);
await refused("two reviews of one month", pg.exec(`insert into month_reviews (user_id, month) values ('u1', '2026-10')`));
await refused("a month that isn't a month", pg.exec(`insert into month_reviews (user_id, month) values ('u1', '2026-13')`));
await refused("a note over 1,000 characters", pg.exec(`update month_reviews set note = repeat('x', 1001)`));
await pg.exec(`update month_reviews set match_summary = '{"accountsOk": 3, "accountsTotal": 3}'`);
assert.equal((await pg.query("select match_summary->>'accountsOk' as n from month_reviews")).rows[0].n, "3", "the match result is kept");
console.log("✓ month reviews keep their shape");
await pg.exec(`insert into goals (id, user_id, name, kind, target_sen, by_month) values ('00000000-0000-0000-0000-0000000000a1', 'u1', 'DP rumah', 'save', 15000000000, '2028-06')`);
await refused("a target of 0", pg.exec(`insert into goals (user_id, name, kind, target_sen) values ('u1', 'x', 'save', 0)`));
await refused("an empty name", pg.exec(`insert into goals (user_id, name, kind, target_sen) values ('u1', '', 'save', 1)`));
await refused("a month that isn't a month", pg.exec(`insert into goals (user_id, name, kind, target_sen, by_month) values ('u1', 'x', 'save', 1, '2028-6')`));
await pg.exec(`insert into goal_sources (goal_id, account_id, part_sen) values ('00000000-0000-0000-0000-0000000000a1', ${A}, 4500000000)`);
await refused("the same account twice in a goal", pg.exec(`insert into goal_sources (goal_id, account_id) values ('00000000-0000-0000-0000-0000000000a1', ${A})`));
await pg.exec(`delete from goals`);
assert.equal((await pg.query("select count(*)::int as n from goal_sources")).rows[0].n, 0, "sources go with their goal");
console.log("✓ goals and their sources keep their shape");
await pg.exec(`insert into recurring (id, user_id, name, kind, amount_sen, account_id, category_id, every, anchor_on) values ('00000000-0000-0000-0000-0000000000f1', 'u1', 'Netflix', 'spend', 5490000, ${A}, ${K}, 'month', '2026-11-01')`);
await refused("a transfer with a category", pg.exec(`insert into recurring (user_id, name, kind, amount_sen, account_id, to_account_id, category_id, every, anchor_on) values ('u1', 'x', 'transfer', 1, ${A}, ${B}, ${K}, 'month', '2026-11-01')`));
await refused("a spend without a category", pg.exec(`insert into recurring (user_id, name, kind, account_id, every, anchor_on) values ('u1', 'x', 'spend', ${A}, 'month', '2026-11-01')`));
await refused("an end before the start", pg.exec(`insert into recurring (user_id, name, kind, account_id, category_id, every, anchor_on, end_on) values ('u1', 'x', 'spend', ${A}, ${K}, 'month', '2026-11-01', '2026-10-01')`));
await pg.exec(`insert into recurring (user_id, name, kind, account_id, category_id, every, anchor_on) values ('u1', 'Token', 'spend', ${A}, ${K}, 'month', '2026-11-01')`); // an amount that changes
await pg.exec(`insert into recurring_runs (recurring_id, due_on, skipped) values ('00000000-0000-0000-0000-0000000000f1', '2026-11-01', true)`);
await refused("a day done twice", pg.exec(`insert into recurring_runs (recurring_id, due_on) values ('00000000-0000-0000-0000-0000000000f1', '2026-11-01')`));
await pg.exec(`insert into recurring_dismissed (user_id, key) values ('u1', 'kopi|a|100')`);
await refused("a suggestion dismissed twice", pg.exec(`insert into recurring_dismissed (user_id, key) values ('u1', 'kopi|a|100')`));
await pg.exec("delete from recurring");
assert.equal((await pg.query("select count(*)::int as n from recurring_runs")).rows[0].n, 0, "runs go with their item");
await pg.exec("delete from recurring_dismissed");
console.log("✓ recurring items, their days and dismissed suggestions keep their shape");
await pg.exec(`insert into transactions (user_id, "on", kind, amount_sen, account_id, category_id, client_ref) values ('u1', '2026-11-24', 'spend', 3800000, ${A}, ${K}, '6f1c0b2e-1111-4a2b-9c3d-000000000001')`);
await refused("the same client reference twice", pg.exec(`insert into transactions (user_id, "on", kind, amount_sen, account_id, category_id, client_ref) values ('u1', '2026-11-24', 'spend', 3800000, ${A}, ${K}, '6f1c0b2e-1111-4a2b-9c3d-000000000001')`));
await pg.exec(`insert into transactions (user_id, "on", kind, amount_sen, account_id, category_id) values ('u1', '2026-11-24', 'spend', 100, ${A}, ${K}), ('u1', '2026-11-24', 'spend', 100, ${A}, ${K})`);
console.log("✓ a client reference is used once; rows without one are unaffected");
const lo = await pg.query<{ looks_ok: boolean }>("select distinct looks_ok from transactions");
assert.deepEqual(lo.rows.map((r) => r.looks_ok), [false], "existing rows don't look fine by default");
await pg.exec("update transactions set looks_ok = true where amount_sen = 100");
await refused("looks_ok left empty", pg.exec("update transactions set looks_ok = null"));
console.log("✓ a transaction can be marked as looking fine; existing rows aren't");
// FINNY-185: a deleted transaction waits in the trash; its account may be gone by then (no foreign key), its owner may not.
await pg.exec(`insert into deleted_transactions (id, user_id, undo_id, "on", kind, amount_sen, account_id, created_at) values ('6f1c0b2e-2222-4a2b-9c3d-000000000001', 'u1', '6f1c0b2e-2222-4a2b-9c3d-0000000000aa', '2026-11-24', 'spend', 100, '6f1c0b2e-2222-4a2b-9c3d-00000000dead', now())`);
await refused("a trash row for nobody", pg.exec(`insert into deleted_transactions (id, user_id, undo_id, "on", kind, amount_sen, account_id, created_at) values ('6f1c0b2e-2222-4a2b-9c3d-000000000002', 'nobody', '6f1c0b2e-2222-4a2b-9c3d-0000000000aa', '2026-11-24', 'spend', 100, '6f1c0b2e-2222-4a2b-9c3d-00000000dead', now())`));
console.log("✓ the trash keeps a deleted transaction even when its account is gone");
// FINNY-209: a statement keeps its own balances (a card bill negative); workbook batches and older statements have none.
await pg.exec(`insert into import_batches (user_id, source, kind, bank, file_hash, period_from, period_to, opening_sen, closing_sen) values ('u1', 'statement', 'statement', 'mandiri-card', 'h2', '2026-09-18', '2026-10-17', -21500000, -318000000)`);
const bal = (await pg.query<{ o: string; c: string }>("select opening_sen::text as o, closing_sen::text as c from import_batches where file_hash = 'h2'")).rows[0];
assert.deepEqual(bal, { o: "-21500000", c: "-318000000" }, "a statement's balances are kept exactly");
assert.equal((await pg.query("select count(*)::int as n from import_batches where closing_sen is null")).rows[0].n, 3, "older batches keep no balances");
await pg.exec(`insert into money_accounts (user_id, name, type, opening_on, opening_sen) values ('u1', 'Rina (owes me)', 'owed', '2026-11-01', 250000000)`);
console.log("✓ a statement's balances are kept; an owed-to-me account fits the table");
await pg.exec("delete from month_reviews;");
await pg.exec("delete from emergency_sources; delete from emergency_funds;");
await pg.exec("delete from account_values; delete from things;");
await pg.exec("delete from debt_plans;");
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
