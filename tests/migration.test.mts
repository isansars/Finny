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
for (const want of ["users", "sessions", "auth_accounts", "verification_tokens"]) assert.ok(up.includes(want), `missing ${want}`);
for (const { tag } of [...journal.entries].reverse()) {
  const down = path.join(folder, "down", `${tag}.sql`);
  assert.ok(existsSync(down), `no down script for ${tag} (drizzle/down/${tag}.sql)`);
  await pg.exec(readFileSync(down, "utf8"));
}
assert.deepEqual(await tables(), [], "down scripts leave tables behind");
console.log(`✓ ${journal.entries.length} migration(s) applied and rolled back`);
await pg.close();
