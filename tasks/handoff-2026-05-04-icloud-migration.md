# Session handoff — moved out of iCloud

**Date:** 2026-05-04 (~14:25 BST)
**New project location:** `~/code/filmcal2` (NOT `~/Documents/code/filmcal2` anymore)
**Branch:** `feat/unified-scrape-slash-command` (already pushed to origin)

## Why we're here

The old location at `~/Documents/code/filmcal2/` lives inside iCloud Drive. macOS "Optimize Mac Storage" had silently evicted parts of `node_modules` to the cloud, leaving stubs behind. Every cleanup attempt (`rm -rf`, `mv`, `find -delete`, `npm install`) hung at the kernel level waiting for evicted files to download — that's been the root cause of all the install failures dating back to the Node 22 upgrade pause 30+ hours ago.

Confirmed with macOS error code -8013 ("item needs to be downloaded") and screenshot from user.

## What was done

1. **Pushed `feat/unified-scrape-slash-command` to GitHub** (was 7 commits ahead of main, now safely backed up)
2. **Cloned fresh from `https://github.com/jamesbarge/pictures.git`** to `~/code/filmcal2/`
3. **Checked out `feat/unified-scrape-slash-command`** in the new location
4. **Copied all gitignored files** from old → new:
   - All `.env.local`, `.env.prod.local`, `.env.check.local`, `.env.verify.local`, `.env.vercel*`
   - `frontend/.env.local`
   - `.claude/CLAUDE.md`, `.claude/data-check-learnings.{json,md}`, `.claude/settings.local.json`
   - `.claude/agents/` (189 local agent definitions)
   - `.claude/skills/` (5 local skills)
   - `.claude/agency-agents-docs/`, `.claude/plans/`
   - `.claude/commands/{scrape,scrape-one,data-check,health,kaizen,posthog-optimize,ui-skills,CLAUDE}.md` — the local-only slash commands
   - `.claude/rules/{database,scrapers}.md` (untracked rules)
   - `.mcp.json`
   - `.cursor/`, `.kiro/`, `.windsurf/`, `.tessl/`, `.trigger/` (IDE configs)
   - `.agent/`, `.agents/`
   - `.vercel/` (Vercel project link)
   - `.husky/_` (git hooks runtime)
   - `.planning-archive/`
   - `docs/`, `Pictures/` (local research notes)
   - `changelogs/CLAUDE.md`
   - `tasks/local-vs-baseline-2026-04-28.md` and `tasks/phase-2-status-2026-04-26.md` (still untracked, do NOT commit)

5. **Did NOT copy** (intentional — regenerable or runtime garbage):
   - `node_modules/` (run `npm install` fresh)
   - `frontend/node_modules/` (run `npm install` in frontend/)
   - `.next/`, `dist/`, `build/`, `coverage/` (build outputs)
   - `.playwright-mcp/`, `.worktrees/`, `.claude/worktrees/`, `.claude/scheduled_tasks.lock` (runtime)
   - `.DS_Store` files

6. **Old location** at `~/Documents/code/filmcal2/` is **left intact** as a recoverable backup. Delete it later when you're confident the new home works (probably easiest via Finder → drag to Trash, then "Empty Trash" once iCloud syncs the deletion to the cloud).

## What's NOT done — pick up here

The original Phase 3 spike workflow is still in front of us. From the new clean home (`~/code/filmcal2`):

### Step 1: install dependencies (fresh, NO iCloud weirdness)
```bash
cd ~/code/filmcal2
npm install
cd frontend && npm install && cd ..
```

These should be FAST (~3-5 min each) because the new location is on the regular Data volume, not iCloud-synced.

### Step 2: apply migration 0004 (creates `enrichment_corrections` table)
```bash
npm run db:migrate
```

Migration is non-destructive (one new table + 2 enums + 2 indexes). Idempotent — safe to re-run. **Requires user "ship it" approval** under the project's deployment gate (touches production Supabase).

### Step 3: verification suite
```bash
npx tsc --noEmit
npm run lint
npm run test:run    # 932 tests
cd frontend && npx playwright test --list && cd ..
```

### Step 4: the 5-cinema spike (the actual goal of all this)

Per `Pictures/Research/scraping-rethink-2026-05/SYNTHESIS.md`:

| # | Cinema | Validates | Pass criteria |
|---|---|---|---|
| 1 | `bfi-southbank` | complex static HTML, FM-05 concat regression | ≥200 screenings; zero `directors: ["title + intro by ..."]` rows |
| 2 | `curzon-soho` | Cloudflare SPA, FM-16 process-leak | ≥80 screenings × 7 days; `ps aux \| grep chrom` flat post-run |
| 3 | `picturehouse-central` | suffix variants flood | suffix stripping collapses 18→4 distinct films |
| 4 | `garden` | static baseline + bilingual | bilingual pair correctly merged; £0 cost |
| 5 | `barbican` | curatorial prefix flood + sold-out | all 74 prefix variants stripped; sold-out preserved |

Run each via `/scrape-one <slug>`, then `/scrape` for full end-to-end. Pass gate: all 5 measurably beat the baseline in `tasks/local-vs-baseline-2026-04-28.md` AND the 136 fixtures pass clean.

If green: PR + merge after explicit "ship it" / "deploy" / "go live" keyword.
If red: fix on the branch, do not merge.

## Critical files for next session

- `Pictures/Research/scraping-rethink-2026-05/SYNTHESIS.md` — architecture + 5 critical bets
- `Pictures/Research/scraping-rethink-2026-05/07-internal-archaeology.md` — failure-mode taxonomy (29 entries)
- `src/scripts/run-scrape-and-enrich.ts` — orchestrator
- `src/lib/scrape-quarantine.ts` — Prowlarr-style silent-breaker detection
- `src/lib/embeddings.ts` — bge-m3 wrapper + judge stub (Phase 3 wire-up target)
- `src/lib/tmdb/__tests__/enrichment-fixtures.ts` — 136 immutable regression cases
- `src/db/schema/enrichment-corrections.ts` — append-only audit log schema
- `tasks/local-vs-baseline-2026-04-28.md` — spike comparison baseline (untracked)

## Notes for resuming Claude

- We're in **auto mode**. Execute, don't deliberate.
- `.claude/commands/scrape.md` and `scrape-one.md` are local-only (gitignored) and now in this location.
- `tasks/local-vs-baseline-2026-04-28.md` and `tasks/phase-2-status-2026-04-26.md` should stay untracked — don't commit them.
- Deployment gate still applies: merge / deploy / push need explicit "ship it" / "deploy" / "go live".
- The user is non-technical-leaning. Keep status updates clear, batch approval requests.
- If `npm install` works first try here (very likely — no iCloud), the original 30-hour battle is over.
