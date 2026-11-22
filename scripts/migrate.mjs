// Applies the SQL migrations in ./drizzle. Runs before `next build` (so Vercel migrates on deploy); safe to repeat.
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL; // Neon: a direct connection for migrations

if (url) {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.Pool({ connectionString: url.replace(/([?&])sslmode=(require|prefer|verify-ca)(?=&|$)/i, "$1sslmode=verify-full") });
  await migrate(drizzle(pool), { migrationsFolder });
  await pool.end();
  console.log("✓ Postgres migrated");
} else if (!process.env.VERCEL) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdirSync } = await import("node:fs");
  const dir = process.env.FINNY_PGLITE_DIR ? path.resolve(process.env.FINNY_PGLITE_DIR) : path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
  console.log(`✓ Local PGlite migrated (${path.relative(process.cwd(), dir)})`);
} else {
  console.error("✗ DATABASE_URL isn't set. Add Neon from the Vercel project's Storage tab.");
  process.exit(1);
}
