// Runs the e2e suites against a production build: builds (unless QA_NO_BUILD=1), migrates a throwaway PGlite folder,
// starts `next start` on QA_PORT (default 3210) and runs every tests/e2e/*.e2e.cjs (or the ones named on the command line).
// Screenshots go to QA_SHOTS (default qa-shots/). Never touches .data/pglite.
const { spawn, execSync } = require("node:child_process");
const { readdirSync, rmSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const port = Number(process.env.QA_PORT || 3210);
const dbDir = path.join(root, ".data", `qa-${port}`);
const env = {
  ...process.env, FINNY_PGLITE_DIR: dbDir, DATABASE_URL: "", PORT: String(port),
  AUTH_SECRET: process.env.AUTH_SECRET || "qa-only-secret-qa-only-secret-qa-only-secret",
  AUTH_URL: `http://localhost:${port}`, FINNY_DEV_LOGIN: "1", FINNY_QA: "1",
  FINNY_ALLOWED_EMAILS: "owner@finny.test",
};
const run = (cmd) => execSync(cmd, { cwd: root, env, stdio: "inherit" });

(async () => {
  if (process.env.QA_NO_BUILD !== "1") run("npx next build");
  rmSync(dbDir, { recursive: true, force: true }); mkdirSync(dbDir, { recursive: true });
  run("node scripts/migrate.mjs");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + "/login")).status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const wanted = process.argv.slice(2);
  const suites = readdirSync(__dirname).filter((f) => f.endsWith(".e2e.cjs") && (!wanted.length || wanted.some((w) => f.includes(w)))).sort();
  let failed = 0;
  for (const s of suites) {
    console.log(`\n▶ ${s}`);
    try { await require(path.join(__dirname, s))({ base, shots: path.resolve(root, process.env.QA_SHOTS || "qa-shots") }); }
    catch (e) { failed++; console.error(`✗ ${s}: ${e.stack || e}`); }
  }
  server.kill("SIGINT");
  await new Promise((r) => { server.once("exit", r); setTimeout(r, 5000); });
  if (failed) { console.error(`\n${failed} suite(s) failed. Server log tail:\n${log.slice(-3000)}`); process.exit(1); }
  console.log(`\n✓ ${suites.length} suite(s) passed`);
  process.exit(0);
})();
