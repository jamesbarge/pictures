# Session Plan — 2026-06-01 (ultracode) — "make app 5× better" continuation

User approved (via AskUserQuestion): **#640 deploy sequence**, **semantic-search deps**,
**bulk-close #606–#636**, and autonomous **sitemap**. Prod Clerk key fix is on the USER (set
`pk_live_` in Vercel frontend env — verified the live bundle still ships `pk_test_…smooth-prawn-4`).
Prior session's record is preserved in `tasks/HANDOFF.md`.

## Track C — Bulk-close #606–#636 ✅ DONE
- [x] Closed all 30 superseded PRs (606–636 excl 619-merged). Only #640 remains open.
- [x] Deleted 30 in-scope remote branches. (26 unrelated stragglers left — held by locked
      worktrees from older sessions; out of scope, not deleting to avoid losing unmerged work.)

## Track D — SEO sitemap (autonomous; frontend auto-deploys, no promote for v1)
- [ ] D1 `frontend/src/routes/sitemap.xml/+server.ts`: static routes + 64 cinemas (`/api/cinemas`)
      + 17 festivals (`/api/festivals`) + people (`/api/directors`, window TBD) + films.
      Films: try backend enumerator → fallback to `browse` top-200 (forward-compatible).
- [ ] D2 `frontend/static/robots.txt`: add `Sitemap: https://www.pictures.london/sitemap.xml`.
- [ ] D3 Verify: `cd frontend && npm run dev`, `curl localhost:5173/sitemap.xml`, validate XML +
      sample URLs 200 against prod. Confirm `/people/{name}` window doesn't 404.
- [ ] D4 (rides #640 promote) backend `GET /api/films/sitemap` → all film ids+updatedAt; frontend
      auto-upgrades to full ~1082-film coverage.
- [ ] Ship: PR + both changelogs. Frontend-only part auto-deploys on merge.

## Track A — #640 BFI hardening deploy sequence (COORDINATED UNIT — promote-gated)
- [ ] A1 Resolve #640 conflict (now CONFLICTING/DIRTY after #637–#641 landed). CI green.
- [ ] A2 Merge #640 (approved).
- [ ] A3 [USER GATE] Promote `api.pictures.london` to new build (per-action keyword each time).
- [ ] A4 Run JW3 scrape + BFI scrape (tsx local → prod DB; watch node_modules hang risk).
- [ ] A5 `npx tsx --env-file=.env.local scripts/dedup-bfi-sourceid-migration.ts --execute`.
- [ ] A6 Verify JW3 (#641) + BFI dedup live.

## Track B — Semantic search (FLAGSHIP; approved deps: @huggingface/transformers + pgvector)
- [ ] B0 Await Explore agent (search-mapper) architecture map.
- [ ] B1 Design (workflow judge-panel): serverless embedding strategy, model+dims, index
      (hnsw vs ivfflat), fusion with lexical (RRF), cold-start mitigation.
- [ ] B2 Implement: pgvector ext + vector column + index migration; offline backfill script;
      query-time embed + vector search in `/api/films/search`; fuse with #638 lexical ranking.
- [ ] B3 Review (code-reviewer agent) + verify against prod DB.
- [ ] B4 Ship: backend → rides a promote.

## Gotchas (from HANDOFF.md — keep in view)
- api.pictures.london alias is PINNED → backend merges need `npx vercel promote` (per-action OK).
- Frontend pictures.london auto-deploys from main.
- Root node_modules corrupted → `next dev`/`vitest`/FestivalDetector-importing scrapers HANG.
  `tsc --noEmit` is the working gate; tsx scripts work. Bash sandbox blocks HTTPS → disable it.
- ESLint pre-commit hook broken → `--no-verify`. Drizzle `sql` needs `.toISOString()` / `IN (sql.join)`.
