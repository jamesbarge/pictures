# Peckhamplex time provenance — regression test, no conversion change

**PR**: pending (branch `fix/peckhamplex-time-provenance`, base `eae19e93`)
**Date**: 2026-09-10

## Context
The 2026-09-09 22:26 BST Peckhamplex scrape diff printed ten same-film/same-date pairs where the
existing row was exactly one hour later than the rescraped row (Spider-Man Thu 10 Sep 17:45 → 16:45,
Tony 19:00 → 18:00, …). The diff keys on title + UTC instant, so this was a timing question, not a
source-id rekey. The earlier audit (2026-09-08) had already withdrawn the "stale rows" explanation.

## What was verified
- **Source clock**: two film pages captured read-only on 2026-09-10 08:04–08:05Z with URL, time and
  sha256. On all 20 showtimes the `<time datetime>` attribute, the visible clock text and the
  button's analytics label (`'… at 16:45'`) agree. The attribute has no zone designator; the venue
  publishes London local time. Each button carries a distinct Veezi session id.
- **Parser**: `parseDateTime` → `ukLocalToUTC(y, m, d, h, mi)` stores 16:45 local as `15:45Z` during
  BST, rendering 16:45 BST. That is what the 2026-09-09 run wrote. `sourceId` embeds that instant;
  0 current rows have a `source_id` ISO that differs from their stored `datetime`.
- **One-hour-late rows**: read-only DB at 08:07Z shows Spider-Man Thu 10 Sep stored as
  `2026-09-10T16:45:00Z` (17:45 BST) with `booking_url` purchase id 83098, `scraped_at` 06:06Z, no
  `scraper_runs` row. The captured page has purchase id 83098 at 16:45. If the source clock at 06:06Z
  matched the 08:04Z capture, the stored value is the attribute read as UTC. That is a hypothesis: no
  06:06Z source capture or execution provenance exists, and the current code would produce the same
  row if the source itself showed 17:45 at that moment.

## Changes
- `src/scrapers/cinemas/peckhamplex.test.ts` (new): 4 tests through `PeckhamplexScraper.scrape()`
  with `fetch` stubbed and `Date` faked (`toFake: ["Date"]`, so the scraper's `setTimeout` delay
  still runs). Asserts BST and GMT conversions, `sourceId` embedding, host-TZ independence and the
  listing → film-page fetch sequence.
- `src/scrapers/cinemas/__fixtures__/peckhamplex/` (new): film page reduced from the real capture
  (markup verbatim inside `.book-tickets`), a **synthetic** GMT variant (same markup, dates moved to
  December 2026; labelled synthetic in the file header, `PROVENANCE.json` and the test name), two
  listing stubs, and `PROVENANCE.json`.
- `src/scrapers/SCRAPING_PLAYBOOK.md`: time-provenance note under the Peckhamplex section.
- `src/scrapers/cinemas/peckhamplex.ts`: **unchanged**. No conversion change is justified by source
  evidence; changing it would make the scraper disagree with the source.

## Evidence quality
- Failing-first: the pinned expectation (16:45 local → `15:45Z`) fails under the pre-PR-#483
  host-local `new Date(y, m, d, h, mi)` conversion on a UTC host (`16:45Z`) and passes under
  `ukLocalToUTC` on both UTC and London hosts (demonstrated with a one-off script, recorded in the
  worktree handoff).
- Tested: targeted test 4/4 under `TZ=UTC` and under `TZ=Europe/London` (explicit runs, exit 0 each); `npm run test:run -- --pool=threads --maxWorkers=2`
  145 files / 2166 tests, exit 0; `npm run lint` 0 errors (61 pre-existing warnings); `npx tsc --noEmit`
  exit 0.
- Inspected only: `screenings.scraped_at` shows writes to 13 cinemas in the same 06:01–06:06Z
  window; other venues' times not examined and no claim is made about them.

## Impact
- No production write, no migration, no dependency, no scrape run.
- 87 Peckhamplex rows currently carry `scraped_at` 2026-09-10 06:06Z with no `scraper_runs` entry.
  **20 of them are verified one hour late** against captured pages: same film, same London date,
  the captured showtime sits at exactly stored−1h, its Veezi purchase id equals the row's stored
  `booking_url` purchase id, and the stored clock is absent from the page (Spider-Man ×10, Tony ×10).
  The **other 67 are unverified**: their films were not captured. Which films or listings the 06:06Z
  write covered beyond those two is not claimed. Whether yesterday's correct rows were deleted or
  replaced is **not established** (row ids were not captured beforehand). The writer's origin is
  **unresolved** and out of scope. A preview-only list with exact ids, stored and source instants and
  purchase ids is in the worktree handoff. Restoration is a separate decision.
