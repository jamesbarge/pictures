# Spike Result — 2026-05-04

**Branch:** `feat/unified-scrape-slash-command`
**Verdict:** RED per strict pass-criteria → **do not merge**
**Migration 0004:** applied successfully (separate from spike)

## What ran cleanly

| Step | Result |
|---|---|
| Root `npm install` | ✅ 1581 packages in 15s |
| Frontend `npm install` | ✅ 214 packages in 3s |
| Migration `0004_typical_thunderball` | ✅ Applied via surgical SQL + journal backfill (drizzle had pre-existing drift; details below) |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 41 warnings, 0 errors (all pre-existing) |
| `npm run test:run` | ✅ 932 / 932 tests pass in 7.37s |
| `frontend npx playwright test --list` | ✅ 180 tests across 2 files |

## 5-cinema spike pass/fail

| # | Cinema | Criterion | Result | Notes |
|---|---|---|---|---|
| 1 | BFI Southbank | ≥200 future + 0 director-concat | ✅ PASS (595 future, 0 concat rows in DB) | Local scrape blocked by Cloudflare → validated from prod cron data |
| 2 | Curzon Soho | ≥80 in next 7 days + ps clean | ❌ FAIL on count (55/80) ; ✅ ps clean | Couldn't local-rerun (Cloudflare). Cron declining: 90→79→70 over 3 days |
| 3 | Picturehouse Central | suffix-tagged titles → 0 | ✅ PASS (0 leftover, 52 distinct films) | Validated from prod data |
| 4 | Garden Cinema | bilingual merge + £0 cost | ✅ PASS (228 fresh, 0 duplicates, 35s) | Locally rescraped successfully |
| 5 | Barbican | curatorial prefixes stripped + sold-out preserved | ⚠️ 1 leftover prefix (false-positive — "Family Film Club x ..." is a real programme, not a strip-target); 6 sold_out preserved via `availability_status` | Locally rescraped (53s, 36 screenings) |

## Critical environmental finding — Cloudflare blocks local headless

This is the load-bearing issue that prevented local validation of BFI/Curzon:

- BFI's overnight cron run at 03:10 UTC produced 248 screenings. Same scraper code, run locally at 14:18 UTC, produced 0 — Cloudflare challenge timeout.
- Tested Patchright (more actively maintained Playwright fork than rebrowser-playwright):
  - `chromium.launch()` (headless) → still blocked by BFI Cloudflare
  - `chromium.launchPersistentContext()` (headless) → still blocked
  - `chromium.launchPersistentContext()` + `headless: false` → **gets through** (full BFI Southbank page, 318KB HTML, real title)
- Verdict: Patchright's full stealth requires both `launchPersistentContext` AND headed mode AND likely `channel: 'chrome'`. Plain `launch()` API has degraded stealth. The current scraper architecture in `src/scrapers/utils/browser.ts` uses plain `launch()`.

**Implication:** the rebuild as currently shaped cannot scrape Cloudflare-protected cinemas (BFI, Curzon, possibly Picturehouse) in headless mode from this local environment. The Vercel cron is currently running an older deployment that still works — but if this branch ships, the cron will start failing on those cinemas.

## What I changed locally and reverted

To explore the Cloudflare fix I made the following edits, all of which were **reverted before stopping** so the branch returns to its original feat/unified-scrape-slash-command state:

- Installed `patchright` npm package + downloaded its Chromium binary
- Edited `src/scrapers/utils/browser.ts`: switched import from `rebrowser-playwright` → `patchright`; updated docstring
- Sed-replaced `"rebrowser-playwright"` → `"patchright"` across 18 other files in `src/` and `scripts/`
- Fixed stale `~/Documents/code/filmcal2` paths in `.claude/commands/scrape.md` and `scrape-one.md` (these are gitignored, so the fix doesn't appear in git status)

The `patchright` dep was uninstalled during revert. Path fixes in the gitignored slash command files were kept.

## Migration 0004 — what actually happened

The handoff said `npm run db:migrate` would be idempotent. It wasn't, because of pre-existing schema drift:

- 21 tables already existed in `public` (production schema populated via historical `db:push` in dev)
- `drizzle.__drizzle_migrations` tracking table existed but was **empty** (0 rows)
- Drizzle's migrate command read the empty journal and tried to apply 0000 onwards — failed silently on `CREATE TABLE cinemas` (already exists)

The fix (with explicit "ship it" re-approval after surfacing this):

1. Computed SHA256 hashes of all 5 migration files (matching drizzle's algorithm: raw file contents, no transformation)
2. Ran `0004_typical_thunderball.sql`'s 5 statements directly via `postgres` library in a transaction
3. Inserted 5 rows into `drizzle.__drizzle_migrations` with computed hashes + journal `when` timestamps
4. Verified by re-running `npm run db:migrate` — got `[✓] migrations applied successfully` cleanly with hashes matching

Net effect: `enrichment_corrections` table exists with 2 enums + 2 indexes, AND drizzle's tracking table is now reconciled. Future `db:migrate` runs are clean no-ops. The drift problem the project's had since inception is now fixed.

There's also an orphaned `0004_enable_rls.sql` file on disk that's NOT in `_journal.json` — drizzle ignores it. Not blocking.

## Other findings worth noting

- **Declining cron screenings across multiple cinemas** (Curzon 90→79→70, Picturehouse 236→208→180, Barbican 52→40→36 over 3 days). Could be UK Bank Holiday week (May 5) effect or a data-quality regression. Warrants investigation before next spike.
- **Gemini API key invalid** — every scraper run shows `API_KEY_INVALID` errors during AI title-extraction and content classification. Pipeline falls back to similarity matching cleanly (0 failed inserts), but cost-of-quality is degraded. Need to set `GEMINI_API_KEY` in `.env.local`.
- **2 polluted scraper_runs rows** — my failed local BFI runs at 14:18 and 14:50 UTC wrote `success + 0` rows. Any anomaly-detector watching for `success+empty` will flag these.

## Recommended next session

1. **Fix Cloudflare bypass before re-running spike.** Options in order of effort:
   - (a) Refactor `browser.ts` to use `chromium.launchPersistentContext` (changes Browser→BrowserContext API). Test headless on prod environment, not locally — Vercel/server IPs may not be challenged the way local IPs are.
   - (b) Try Camoufox (the other replacement option flagged in `Pictures/Research/scraping-rethink-2026-05/01-browser-automation-libraries.md`).
   - (c) Restore `playwright-extra + StealthPlugin` (revert commit 47773b7) — this is the regression we're trying to avoid, but it was working in prod.
2. **Investigate Curzon/Picturehouse/Barbican declining trends.** Bank holiday effect or scraper bug? Compare scraped page DOM to a stored fixture if one exists.
3. **Set `GEMINI_API_KEY`** so AI fallbacks work and cost-of-quality goes back to where it was.
4. **Clean up the 2 polluted `scraper_runs` rows** if the quarantine logic is sensitive to them.
5. **Don't merge `feat/unified-scrape-slash-command` until the Cloudflare bypass is solid.**

## Files referenced from this work
- `src/scrapers/utils/browser.ts` — central browser launcher (currently rebrowser-playwright)
- `src/db/migrations/0004_typical_thunderball.sql` — the migration we applied
- `src/db/migrations/meta/_journal.json` — drizzle journal
- `Pictures/Research/scraping-rethink-2026-05/SYNTHESIS.md` — original spike spec
- `tasks/local-vs-baseline-2026-04-28.md` — baseline numbers I diffed against
- `tasks/handoff-2026-05-04-icloud-migration.md` — the inbound handoff that set up this session
