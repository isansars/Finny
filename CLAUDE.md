# Finny: working agreement for Claude

Finny is the owner's **personal** product (not a Hey Dango one). It is planned on the FINNY workspace of Dango Board (board.heydango.com, workspace key `FINNY`), with the same team process as Dango Board: tickets with Why + numbered acceptance criteria, design notes before UI work, a QA suite with screenshots, release notes after each release.

- **Board access:** REST at `https://board.heydango.com/api/v1` (the session's network secret for that host is the FINNY token). Act as a teammate with the header `x-dango-agent: <Name>`.
- **Branches:** one branch per task named with its key (`claude/FINNY-23-<slug>` in cloud sessions), a PR into the sprint branch titled `FINNY-23: …`, merged when checks pass. The sprint branch reaches `main` only after the owner says "ship it". Vercel deploys `main` to production and builds a preview for every PR.
- **Living product docs (owner, 23 Nov 2026: the Product page sat at "before Sprint 1" for four releases and there was no roadmap):** in every sprint planning and after every release, 🐰 Poppy rewrites **"Finny · Product"** (Where we are, Capabilities, open Gaps, Where it's going) and its child page **"Finny · Roadmap"** (Delivered = the last three releases, Now, Next, Later), so each says only what is true now. The roadmap picture's source is `docs/diagrams/finny/roadmap.json`, drawn with `node ../mochi-board/scripts/diagram.mjs <source> <out.png>`; look at the PNG before uploading it.
- **Money is integer sen** (`bigint`, rupiah × 100). Never a float.
- **Privacy:** the owner's financial data never goes into git, test fixtures, screenshots or outside requests. Fixtures use made-up numbers; real bank statements stay in `fixtures-private/` (git-ignored).
- **Versions:** `0.MINOR.PATCH`, MINOR + 1 per sprint (Sprint 1 = v0.1.0).
- **Checks before a PR:** `npm run typecheck && npm run lint && npm test && npm run test:migration`; the e2e suite before the ship.
- Next.js here is v16: read `node_modules/next/dist/docs/` before using an API you aren't sure of (`middleware` is now `proxy`, request APIs are async).
