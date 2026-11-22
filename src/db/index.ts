// Database connection.
//  - DATABASE_URL set   -> Postgres (Neon in production) through node-postgres.
//  - DATABASE_URL empty -> embedded PGlite in ./.data/pglite (local development and tests, no server needed).
// Both expose the same Drizzle API.
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __finnyDb?: DB };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as typeof import("pg");
    // pg warns on sslmode=require; verify-full is what it does anyway (Neon's certificates are public).
    const pool = new Pool({ connectionString: url.replace(/([?&])sslmode=(require|prefer|verify-ca)(?=&|$)/i, "$1sslmode=verify-full"), max: 5 });
    return drizzlePg(pool, { schema });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  // `next build` loads this module in several workers at once: never let them share the folder.
  if (process.env.NEXT_PHASE === "phase-production-build") return drizzle(new PGlite(), { schema }) as unknown as DB;
  // Open PGlite on the first query, not when the module loads (dev workers that never query must not open it).
  let client: InstanceType<typeof PGlite> | null = null;
  const open = () => {
    if (client) return client;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const dir = process.env.FINNY_PGLITE_DIR ? path.resolve(process.env.FINNY_PGLITE_DIR) : path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const c = new PGlite(dir);
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => { c.close().finally(() => process.exit(0)); });
    return (client = c);
  };
  const lazy = new Proxy({} as InstanceType<typeof PGlite>, {
    get(_t, prop) {
      if (prop === "constructor") return PGlite;
      if (typeof prop === "symbol" || prop === "then") return undefined;
      const c = open();
      const v = Reflect.get(c as object, prop, c);
      return typeof v === "function" ? v.bind(c) : v;
    },
  });
  return drizzle(lazy, { schema }) as unknown as DB;
}

export const db: DB = (g.__finnyDb ??= create());
export { schema };
