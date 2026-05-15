# Push recurring data-check fixes into /scrape

**PR**: TBD
**Date**: 2026-05-15

## Problem

`/data-check` has run 250+ patrols and `dqsHistory` in `.claude/data-check-learnings.json` shows 50+ recent entries with scores oscillating 73–96. Inspection of `Pictures/Data Quality/patrol-2026-05-15-*.md` reveals the same classes of fixes recurring every cycle:

| Pattern | Fixed by patrol | Persisted at scrape time? |
|---|---|---|
| Event-prefix titles ("New Writings:", "Funeral Parade presents", …) | every cycle | partial — `EVENT_PREFIXES` array was hand-curated and out of sync with `learnings.json::prefixesToStrip` (79 entries) |
| Event-suffix titles ("(BFI Classics)", "(35mm)", "+ Q&A", …) | every cycle | no — only hand-curated suffix regexes |
| Foreign-title-bracket: `Original (English Translation)` | 6 instances in patrol cycle 19 alone | no |
| Known non-film titles (quizzes, placeholders, recurring music nights) | every cycle | no |
| Directors concat'd with " Starring " | every cycle via SQL UPDATE | no — write path accepted concatenated strings |
| `year=0` from empty `release_date` | every cycle | no — `Number("")` yields 0 and the value persisted |

## Changes

### `src/scrapers/utils/film-title-cleaner.ts`
- New module-init loader reads `.claude/data-check-learnings.json` (gitignored — graceful degrade if absent) and exposes:
  - `loadLearnedPrefixRegexes()` — converts each entry in `prefixesToStrip` to a regex with `^<escaped-literal>\s*[:|]?\s+` semantics, deduplicated against the hand-curated `EVENT_PREFIXES`.
  - `loadLearnedSuffixRegexes()` — same shape for `suffixesToStrip`, applied at the end of the existing suffix-strip block.
  - `getKnownNonFilmType(title)` / `isKnownNonFilmTitle(title)` — case-insensitive exact-match lookup against `knownNonFilmTitles` (34 entries), returns the recorded `type` (e.g. `event`, `live_broadcast`) or `null`.
- New `extractEnglishFromBracket(title)` — detects `Original (English Translation)` when `Original` contains non-ASCII chars. Returns `{ display, lookup }` so callers can keep the display title intact while routing TMDB queries through the English form. Skips ASCII-only originals so "Nine Queens (Nueve reinas)" / "2001: A Space Odyssey (50th Anniversary)" don't trigger.

### `src/scrapers/utils/film-write-guards.ts` (new)
- `sanitizeYear(year)` — returns `null` for `0`, empty string (`Number("")=0`), negatives, < 1900, or > currentYear+5. Otherwise returns the integer year.
- `sanitizeDirectors(directors, context?)` — rejects the whole array if ANY entry matches `/\sStarring\s/i`, returns `[]` and `console.warn`s with context. Filters out empty/whitespace entries from valid arrays.

### `src/scrapers/pipeline.ts`
- `getOrCreateFilm` (around line 432) now calls `extractEnglishFromBracket` and uses the `lookup` form for `matchingTitle` (TMDB / fuzzy resolution). Logged for observability.

### `src/scrapers/utils/film-matching.ts`
- `createFilmWithTMDBMatch` (the line 212 insert) now uses `sanitizeYear(match.year)` and `sanitizeDirectors(details.directors, context)` before `db.insert(films)`. The decade derivation also reads from the sanitized year.
- (The second insert at line 333 already has bespoke `scraperYear`/`Starring`-stripping logic — left untouched to avoid behavior changes.)

### `src/scripts/cleanup-upcoming-films.ts`
- The TMDB-match update at line 257 now wraps `year` and `directors` with the new sanitizers.

### `src/lib/scrape-quarantine.ts`
- New `detectStaleCinemas({ thresholdHours: 24 })` — single-query SELECT against `cinemas LEFT JOIN scraper_runs` that returns cinemas whose most recent run is older than the threshold.
- New `formatStaleCinemaReport(stale)` for the slash-command output (caps at 15 rows + "and N more").
- New `readRecentDqs()` / `formatDqsSnapshot(snapshot)` — reads the last 24h of `dqsHistory` from learnings.json, returns `{ runCount24h, avgComposite24h, lowestComposite24h }` or zero/null when absent.

### `src/scripts/run-scrape-and-enrich.ts`
- The post-summary block now calls `detectStaleCinemas` + `readRecentDqs` (in parallel) and prints the formatted output before the final OK / FAIL block. Wrapped in try/catch so observability never breaks the pipeline exit code.

### Tests
- `src/scrapers/utils/film-title-cleaner.test.ts` (+5 cases): `extractEnglishFromBracket` (5 cases incl. accented vs ASCII-only originals, subtitle parentheticals), learnings.json smoke test.
- `src/scrapers/utils/film-write-guards.test.ts` (new, 10 cases): `sanitizeYear` (empty/zero/negative/`Number("")`/<1900/>current+5/normal), `sanitizeDirectors` (non-array, whitespace, Starring-rejection, warning emitted, valid multi-director).

## Impact

- **/data-check workload**: the recurring prefix/suffix/director/year fixes should drop to near-zero on the next patrol cycle. Foreign-bracket repertory titles get TMDB-matched on scrape instead of waiting for patrol intervention.
- **/scrape report**: stale cinemas + recent DQS now visible at end of every run; no need to switch to a separate tool to see them.
- **Future learnings additions**: when a patrol writes a new prefix/suffix to `learnings.json`, the next /scrape run picks it up automatically at module init.
- **Backwards compat**: the loader is fail-soft. CI and fresh checkouts where the gitignored learnings file isn't present continue to use only the hand-curated patterns.

## Verification

- Type-check (`npx tsc --noEmit`): clean for all modified files.
- Lint (`npm run lint`): 0 errors (pre-existing warning on `debug-riverside.ts` `@ts-nocheck` unchanged).
- Vitest (`npm run test:run`): 930 / 930 pass — 18 new tests on top of the prior 912.
- Module-init loader verified to gracefully no-op when `.claude/data-check-learnings.json` is missing.

## Out of scope (follow-up)
- Wiring `getKnownNonFilmType` into `processScreenings` to skip film resolution and set `content_type='event'` directly. Slightly invasive — the film row currently still gets created with `content_type='event'`. Tracked for next iteration.
- Booking-URL verifier rework (10 extract_failed / cycle, 9/57 cinema coverage).
- Closing the loop fully: live-reload of the learnings cache across a running scraper. Today the module-init cache is fine for the once-per-session /scrape model.
