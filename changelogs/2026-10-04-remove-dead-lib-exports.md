# Remove dead exports and fields in src/lib and src/db

**PR**: #PENDING
**Date**: 2026-10-04

## Changes

### src/lib (top level)
- `title-patterns.ts`: deleted `FRANCHISE_PREFIXES`, `isLikelyCleanTitle` and `cleanBasicCruft`. Only their tests used them; the live copies are private to `title-extraction/ai-extractor.ts` and `content-classifier.ts`.
- `posthog-api.ts`: deleted `queryEvents`, `getEventCounts`, `getSessionRecording`, `getPersonByDistinctId`, the `PostHogEvent` and `EventsQueryParams` types, four never-read query param fields and two `void getProjectId()` lines. `queryTrend`, `queryFunnel` and `listPersons` are now module-private.
- `posthog-supabase-sync.ts`: deleted `syncAllUsersToPostHog` and `trackServerEventWithContext`; `getUserProductData` is module-private. `syncUserToPostHog` stays for the `/api/user` routes.
- `posthog-server.ts`: deleted `captureServerException` and `flushPostHogServer` (zero callers; `instrumentation.ts` calls posthog-node directly).
- `scrape-run-summary.ts` exports one `atomicWrite` (pid+counter temp name, rename, temp cleanup on failure). `scrape-progress.ts` and `scrape-checkpoint.ts` call it inside their existing swallow-and-warn blocks. Deleted `readProgress` and `readRunSummary`; their tests now read the JSON files directly.
- `scrape-quarantine.ts`: the five `detect*` functions lost their `options`/`thresholds` parameters (no caller passed one); the analyzers keep theirs for tests. The flaky severity `bump` closure became a three-level `level()` helper, and `readRecentDqs` uses one `EMPTY_DQS` constant with the `existsSync` branch folded into the catch.
- `rate-limit.ts`: `getOrCreateRatelimiter` takes the Redis client as a parameter, so the redundant null check and throw are gone. Deleted the unused `RATE_LIMITS.user` preset.
- `auth.ts`: deleted `verifyCronSecret` and its 8 tests. No cron route exists. The `CRON_SECRET` lines in `README.md` and `.env.local.example` went with it.
- `api-errors.ts`: deleted `RateLimitError`, the Retry-After branch in `errorResponse`, `isApiError` and the `HttpStatus` map (status codes are now literals).
- `event-classifier.ts`: deleted the unread `cleanTitle` and `confidence` fields, `computeConfidence` and the `classifyEventCached` memo. `screening-classification.ts` calls `classifyEvent` directly.
- `content-classifier.ts`: deleted the `posterStrategy` field, the `PosterStrategy` type, `classifyContentCached` and `clearClassificationCache`. `posters/service.ts` calls `classifyContent` directly.
- `film-similarity.ts`: deleted `isSimilarityConfigured` (always true) and its guard in `film-matching.ts`, plus the title-pattern re-exports that only a test read. The sequel test imports them from `title-patterns.ts`.

### src/lib subdirectories
- `tmdb`: deleted `batchMatchFilms`, `RATE_LIMIT_DELAY_MS`, `getBackdropUrl`, `getFilmVideos`, `TMDBVideo`, `TMDBVideosResponse`, `isAmbiguousTitle`, `checkBlocklist` and `resetBlocklistCache`.
- `posters`: deleted `findPostersForMany` and its `delay` helper, `getPosterPlaceholderDataUrl`, `OMDBClient.getPosterUrl` and `FanartClient.getAllPosters`. The barrel now exports `getPosterService` only, which is all its importers take.
- `title-extraction`: `extractFilmTitleAI` is renamed `extractFilmTitle` and re-exported directly, which removes the forwarding wrapper in `index.ts`. Deleted `hasWordOverlap`, made `isLikelyCleanTitle` private and deleted `index.test.ts`, whose cases repeated `ai-extractor.test.ts`. Its one extra case (cache key is case-sensitive) moved there.
- `jobs/letterboxd-import.ts`: five dynamic imports became static imports.

### src/db and agents
- Deleted 36 unused `$inferInsert`/`$inferSelect` aliases across 11 schema files (`films.ts` untouched), the duplicate `export * from "./seasons"`, `export type Database` and the commented-out link-verification columns in `schema/screenings.ts`.
- `classify-events.ts`: removed the 13 s per-film sleep and batch loop left from the Gemini rate limit.
- `enrich-letterboxd.ts`: deleted `buildTitleCandidates`. `parseRatingWithVerification` returns a `failureReason` itself, so `fetchLetterboxdRating` reports the reason from the first parse.
- `repositories/screening.ts`: deleted `getRecentScreeningsForCinema` and the `ScreeningFilters` test that only asserted its own literal.
- `backfill-posters.ts`: deleted report fields and result rows the summary never reads, the never-incremented `skippedLiveBroadcast` counter, a redundant WHERE branch and an empty header. `processTitle`, `findFilmByTmdbId` and `mergeDuplicateFilm` are unchanged.
- `agents/fallback-enrichment/letterboxd.ts` imports `titleToSlug` from `@/db/enrich-letterboxd` in place of its private copy. `booking-page-scraper.ts` uses `CHROME_USER_AGENT_FULL`.

## Impact
- About 1,560 net lines removed across 66 files. No runtime path loses a caller.
- Behaviour changes, all small: a progress stamp after `tmp/` is deleted mid-run succeeds on the first write; `db:classify-events` finishes in seconds; Letterboxd enrichment reports `rating_parse_error` for an unparseable rating on the stored-slug path; the booking-page scraper sends the shared Chrome 120 user agent.
- Gates: 2,502 tests pass (161 files), lint 0 errors / 61 warnings, `tsc --noEmit` clean.
