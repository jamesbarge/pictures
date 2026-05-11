# Sort /scrape by fewest screenings first + finish BST hardening

**PR**: TBD
**Date**: 2026-05-10

## Changes

### Part 1 — Within-wave sort: fewest screenings first, staleness as tiebreaker

`src/lib/jobs/scrape-all.ts`

- New `loadScreeningCountMap(): Promise<Map<string, number>>` — `SELECT cinema_id, COUNT(*)::int FROM screenings WHERE datetime >= NOW() GROUP BY cinema_id`. Filters to upcoming screenings only so cleanup of past rows doesn't distort the ranking.
- New `entryScreeningCount(entry, countMap)` — returns the MIN count across an entry's venues. Multi-venue chains with one starved venue sort first.
- `runWave(...)` signature extended with a `countMap` parameter. Sort comparator changed to two-key: `a.count - b.count || a.ms - b.ms`. Per-wave log updated to surface both signals.
- `runScrapeAll(...)` loads both maps in parallel via `Promise.all`.

Rationale: the 2026-05-06 scraper coverage audit identified Castle, Castle Sidcup, Barbican, and Coldharbour Blue as low-coverage outliers caused by scraper bugs. Sorting by count first surfaces such failures in the first concurrency slot of each wave — much faster signal than waiting for staleness rotation to expose them.

### Part 2 — Eliminated every unsafe `new Date(y, m, d, h, mi)` callsite

`SCRAPING_PLAYBOOK.md:17` already mandates `ukLocalToUTC(...)` over the native constructor, because the constructor interprets numeric args in the runtime TZ — under `TZ=UTC` (cron, CI, container), this silently adds 1h to BST-period screenings. Five scrapers were already migrated in the working tree (`close-up`, `genesis`, `genesis-v2`, `lexi`, `lexi-v2`). A grep revealed six more callsites still using the unsafe pattern; all are now migrated.

| File:line | Notes |
|---|---|
| `src/scrapers/cinemas/close-up.ts:304` | Second method in the same file. The in-progress diff only fixed the line-390 method. |
| `src/scrapers/cinemas/electric.ts:242` | API-based scraper, parses `YYYY-MM-DD` + `HH:MM`. |
| `src/scrapers/cinemas/electric-v2.ts:173` | Sibling v2 scraper, same parser shape. |
| `src/scrapers/cinemas/peckhamplex.ts:225` | Cheerio-based, parses split date/time parts. |
| `src/scrapers/bfi-pdf/pdf-parser.ts:365` | BFI PDF importer — important for the BFI Southbank backfill path. |
| `src/scrapers/bfi-pdf/programme-changes-parser.ts:283` | BFI programme-changes scraper. |

Static guarantee: `grep -rn "new Date(.*month.*day.*hour" src/scrapers/` now returns zero hits outside `date-parser.ts` (which contains the canonical `Date.UTC(year, month, day, hours, minutes, 0, 0)` call inside `ukLocalToUTC`).

### Not in scope (date-only constructions, no BST risk)

- `bfi-pdf/fetcher.ts:226,237` — month range bounds, no time.
- `cinemas/close-up.ts:270,299` — date-only `testDate` constructions.
- `seasons/base.ts:270,271,290` — season month ranges.

## Impact

- **Operator UX**: When the user runs `/scrape`, broken scrapers now appear in the first ~4 cinemas of each wave instead of being randomly distributed by staleness. If the run is interrupted, the highest-signal cinemas have already been attempted.
- **Time correctness**: Every scraper in the codebase now uses the same UTC-explicit BST handling. The "off by one hour" class of bug — flagged by the data-check patrols and visible to users on the live calendar — cannot reappear from any of the 11 covered scrapers without explicit regression in `date-parser.ts` itself.
- **No behavioural change** for cinemas where the existing scraper already produced correct times (because `ukLocalToUTC` and `new Date(...)` agree when the runtime TZ is `Europe/London`). The fix is invisible on a developer Mac and load-bearing on a UTC server.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 errors, 41 pre-existing warnings.
- `npm run test:run` → 890/890 pass.
- `grep -rn "new Date(.*month.*day.*hour" src/scrapers/ | grep -v date-parser.ts` → empty.
- Post-run DB spot-check across the 6 newly-migrated cinemas: London-local times match the live websites at the same screening (no ±1h drift).
