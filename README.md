# 💰 Finny

A personal financial record dashboard: add transactions by hand in seconds, read the monthly bank e-statement, and see the month at a glance. It replaces two Excel workbooks (a daily-books workbook and a wealth-management workbook).

Planning lives on the FINNY board (Dango Board): epic **FINNY-7**, "Finny · Product", tech design "FINNY-7 · Tech design".

## Run it locally
```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET=$(openssl rand -base64 32)
npm run db:migrate           # embedded PGlite in .data/pglite, no database server needed
npm run dev                  # http://localhost:3000
```
With `FINNY_DEV_LOGIN=1` (never in production) the sign-in page offers a dev sign-in, so you don't need Google locally.

## Checks
```bash
npm run typecheck && npm run lint && npm test && npm run test:migration
npm run test:e2e             # Playwright against a production build (see tests/e2e/README.md)
```

## Stack
Next.js 16 (App Router) + TypeScript, Drizzle ORM, Postgres (Neon in production, PGlite locally), Auth.js with Google, hosted on Vercel. Money is stored as integer sen (rupiah × 100).

## Pictures
Diagram sources are in `docs/diagrams/finny/`; they're drawn with the Dango Board diagram script and uploaded to the board docs.
