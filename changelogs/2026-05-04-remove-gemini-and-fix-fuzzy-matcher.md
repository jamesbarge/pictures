# Remove Gemini from `/scrape` pipeline + fix two pre-existing data quality issues

**PR**: TBD
**Date**: 2026-05-04
**Branch**: `feat/remove-gemini-from-scrape-pipeline`
**Driven by**: User mandate that `/scrape` runs entirely within in-repo code — no LLM API key required. Surfaced two pre-existing data quality issues during verification.

## Why

The previous `/scrape` pipeline routed three classifiers through Google Gemini:
- `event-classifier` (clean title, event types, format detection)
- `content-classifier` (film vs concert vs live broadcast)
- `title-extraction/ai-extractor` (title disambiguation with hallucination guard)

Plus `film-similarity.confirmFilmMatchWithClaude`, gated behind a `useClaude` flag that was never set to true in the scraper pipeline.

During the 2026-05-04 spike (`tasks/spike-result-2026-05-04.md`) we ran the pipeline locally with the Gemini key invalid and observed: every Gemini call failed and the deterministic fallback handled it cleanly with zero failed inserts. The LLM was contributing nothing to success.

This PR removes Gemini from the scrape pipeline (Bucket 1), then fixes two pre-existing issues that became visible once the Gemini-error log noise was gone (Bucket 2 + 3).

## Changes

### Bucket 1 — Replace Gemini classifiers with deterministic rules (commit `f469a21`)

Removes Gemini from the `/scrape` hot path. Each classifier has the same public API and output shape — callers don't change.

- **`src/lib/event-classifier.ts`** — rules engine. The "Rules:" section of the previous Gemini prompt encoded directly: regex tables for event types (q_and_a, premiere, singalong, etc.), screening formats (35mm/70mm/IMAX/4K), 3D, subtitles, audio description, season detection. Clean title via `extractFilmTitleSync`. Confidence buckets derived from the pattern extractor's numeric score plus the secondary signal heuristics.
- **`src/lib/content-classifier.ts`** — slimmed: keeps `quickClassify()` (already 100+ lines of deterministic rules pre-PR) as the main path, deletes the AI block. Ambiguous titles fall through to a `stripLeadingPrefix` + "treat as film, use TMDB" default.
- **`src/lib/title-extraction/ai-extractor.ts`** — now an async adapter on top of `extractFilmTitleSync` from `pattern-extractor.ts` (the synchronous sibling that already powered the enrichment agent). Public exports preserved: `extractFilmTitleAI`, `hasWordOverlap`, `AIExtractionResult`.
- **`src/lib/film-similarity.ts`** — deletes dead `confirmFilmMatchWithClaude` (never invoked from the pipeline). pg_trgm trigram is now the sole arbiter, which it already was in practice.
- **Tests** — rewrite `ai-extractor.test.ts` to exercise the deterministic adapter (drops AI-mock tests, hallucination-guard tests, API-error tests). Remove dead `vi.mock("@/lib/gemini")` from `pipeline.test.ts` and `content-classifier.test.ts`.

Net delta: **−615 LOC** across 9 files. Tests **856 / 856** pass after this commit.

`@google/genai` and `src/lib/gemini.ts` remain installed because admin agents (`src/agents/link-validator/`, `src/agents/scraper-health/`, `src/app/api/admin/agents/*`) still import them. Those are admin-only paths and never reached during a `/scrape` run. Their cleanup is a separate follow-up.

### Bucket 2 — Garden scraper Up→p substring-replace bug (commit `5cf193c`)

The Garden Cinema scraper produced `"What's p, Doc?"` and `"Bringing p Baby"` in the screenings table. Root cause: line 83 of `src/scrapers/cinemas/garden.ts` was `title.replace(rating, "")`. For a single-letter rating like `"U"`, this matched the **first** occurrence — eating the "U" inside "Up" before the trailing rating's "U".

The fuzzy matcher had been rescuing these via 71%/72% trigram similarity. Load-bearing on luck.

**Fix**: anchor the rating strip to end-of-string with `\\s*${escapeRegex(rating)}\\s*$`, then collapse internal whitespace.

Extracted as a static `GardenCinemaScraper.cleanTitle(rawTitle, rating)` so it's directly unit-testable. **15 new tests** in `src/scrapers/cinemas/garden.test.ts` covering the regression cases, multi-character ratings, edge cases, and regex-metacharacter escaping.

### Bucket 3 — Fuzzy matcher hardening (commit `51a7ab9`)

Trigram similarity is unstable on short titles. Two known pre-existing bad merges:
- `"The Thin Man" (1934)` → `"The Third Man" (1949)` at **64%** — fixed-threshold 0.6 auto-accepted it
- `"The Awful Truth" (1937)` → `"The Truth" (1960)` at **60%** — same

Two changes to `src/lib/film-similarity.ts`:

1. **Length-aware threshold** via `trigramThresholdFor(wordCount)`:
   - ≤3 words → ≥0.78
   - ≤5 words → ≥0.70
   - >5 words → ≥0.60 (unchanged)

2. **Year-window filter** via `violatesYearWindow(sourceYear, candidateYear)`: when both have years, reject if delta > 5 (allows 1-2 year re-release tag offsets, blocks 1934-vs-1949 collisions).

`findMatchingFilm` now iterates the top-5 trigram candidates and returns the first that passes both filters, rather than only checking the absolute best trigram match.

**16 new tests** in `src/lib/film-similarity.test.ts` cover the threshold tiers and year-window rules.

### Bucket 4 — Un-merge bad film records (commit `cf7d32f`)

The two pre-existing bad merges from above were already persisted in production Supabase. This commit ships `scripts/unmerge-bad-films.ts` (dry-run by default, `--apply` to commit) which:

1. Looks up the wrong film record by `(title, year)`
2. Locates Garden screenings whose `source_id` reveals the original scraped title (e.g. `garden-the-thin-man-...`)
3. Creates a fresh film record at `(correctTitle, correctYear)` with `match_strategy='manual_unmerge'` for audit trail
4. Re-links the screenings to the new record

**Applied 2026-05-04**: 2 screenings re-linked, 2 film records created (`f42bb487` The Thin Man 1934, `87972753` The Awful Truth 1937). The new records were enriched with TMDB posters during the verification re-scrape.

The script also prints a top-5 audit of low-trigram source_id↔film mismatches at the end so the operator can spot other potential bad merges. Currently surfaces 4 cases that look correct (Xiao Wu / Pickpocket alias, festival compilations) plus one (Stoma / Guo Ran) that needs separate investigation.

## Verification

After all four commits, ran `/scrape-one garden` against production Supabase:

| Metric | Before this PR | After |
|---|---|---|
| `API_KEY_INVALID` errors in log | many (failing API calls + stack traces) | **0** |
| Run time | 35s | 23.4s (~33% faster) |
| Screenings found | 191 | 190 (one passed-time) |
| Failed inserts | 0 | 0 |
| Pipeline cache hit rate | 91.4% | 94.6% |
| `[FilmSimilarity]` matches firing | yes | yes (with new threshold logging) |
| `What's p` / `Bringing p` mangled titles | yes | **0** |
| New film records receiving TMDB posters during scrape | (no new records) | The Thin Man + The Awful Truth got posters automatically |

- `npm run test:run` — **887 / 887 passing**
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors, 41 warnings (all pre-existing)

## Impact

- **`/scrape` is fully self-contained.** No `GEMINI_API_KEY` required to run any cinema scraper or enrichment pass. Setting the key to invalid produces 0 errors.
- **Garden Cinema titles are correct** — no more `"What's p, Doc?"` style artefacts in the DB.
- **Two existing bad merges fixed**, and the matcher won't make these mistakes again.
- **Faster pipeline** (~33% speedup on Garden, expected similar across other static scrapers) because the previous Gemini error path was retrying with exponential backoff before falling back.
- **Same test count target**: 887 passes (vs prior 932). The 76-test drop is the AI-specific tests in `ai-extractor.test.ts` that no longer make sense (mocks of API responses, hallucination-guard tests, JSON-parse-error fallbacks). New tests added: 15 (garden) + 16 (film-similarity) = 31. Net change in test surface coverage is small and structural coverage is preserved via `pattern-extractor.test.ts`.

## Out of scope (deliberately)

- **Admin agents Gemini cleanup** — `src/agents/link-validator/`, `src/agents/scraper-health/`, `src/app/api/admin/agents/*`, `src/lib/qa/utils/gemini-analyzer.ts`, autoresearch harnesses. Approximately 3000 LOC. Admin-only, never invoked during `/scrape`. Discussed in this PR's spike doc; deferred to a follow-up.
- **Cloudflare bypass for BFI/Curzon local scraping** — separate problem, separate branch. Local Cloudflare blocks headless playwright/patchright; production cron from Vercel is unaffected.
- **TMDB enrichment of new film records** — already happens automatically via the existing daily-sweep job and was confirmed working during the verification re-scrape.
- **Other suspect merges from the audit** — `Stoma → Guo Ran` looks wrong but needs separate investigation. Picturehouse/Curzon similar audits would benefit from the new matcher but their data is from cron, not local scrape.
