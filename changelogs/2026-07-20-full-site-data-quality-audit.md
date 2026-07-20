# Full-site data-quality audit — 4 scraper bugs fixed

**PR**: #735
**Date**: 2026-07-20

## Context
User asked to "go through every listing on the site and verify every datapoint is correct, fix any that aren't." Ran the `data-check` skill's patrol at full-catalog scale (all 1,057 upcoming films, all 69 active cinemas, all 7,721 upcoming screenings) instead of its usual 40-film cursor batch, combined with:
- A booking-URL reachability sweep across all 5,019 distinct URLs
- A 69-agent parallel Workflow, each fetching a cinema's real public site and cross-checking it against our DB
- Two scraper-investigation agent passes for the bugs the above surfaced

Full data-side account (TMDB corrections, duplicate merges, non-film reclassifications, etc.) is in `Obsidian Vault/Pictures/Data Quality/patrol-2026-07-20-full-audit.md`. This changelog covers the **code** changes only.

## Changes

### Rich Mix (`src/scrapers/cinemas/rich-mix-v2.ts`)
- Booking URL was a guessed WordPress slug (`/cinema/{slugified-event-name}/`). Confirmed via live probe that Spektrix's event name and the real WP slug disagree independently — even on the BBFC rating baked into the slug — and that Spektrix carries pre-launch staging events with no WP page at all. Replaced with the stable `/book/instance/{numericId}` deep link derived from the Spektrix instance id.
- `healthCheck()` was a single-shot probe with no retry — the actual root cause of Rich Mix's "critical flaky" (70% failure) status, since a transient Spektrix API blip (returning an HTML error page instead of JSON) failed the whole health check even though the venue recovered within seconds. Added a 3-attempt/4s-backoff retry, matching `BaseScraper`'s pattern.

### Bertha DocHouse (`src/scrapers/cinemas/bertha-dochouse.ts` + test)
- Booking URL was Curzon's transient seat-selection URL (`/ticketing/seats/BLO1-NNNNNN`), which 404s once its checkout session expires — the same trap the Curzon chain scraper already avoids by linking to the film page instead. Replaced with the stable DocHouse event page URL, read from the page's own `<link rel="canonical">` / `og:url` meta tag. Also normalized through the shared `normalizeUrl()` helper for consistency with every other href in the file (code-review finding).

### The Chiswick Cinema (`src/scrapers/cinemas/chiswick.ts`, `src/scrapers/platforms/indy.ts` + test)
- The shared INDY-platform adapter had one global `DEFAULT_HORIZON_DAYS` (35). Chiswick publishes its full catalog ~5 months ahead (live probe: bookable showings out to day offset 149 — NT Live, Met Opera, repertory), so the 35-day cap silently truncated ~83% of its catalog (16 films in DB vs. 66 actually bookable live). Added an optional per-venue `horizonDays` override on `IndyVenue`; set to 200 for Chiswick (comfortable margin past the furthest showing found, not flush against it — code-review finding caught the original 150 being snug). Regent Street, the other INDY venue, keeps the 35-day default.
- Verified no rate-limit concern: 160 sequential live GraphQL POSTs succeeded with zero failures; production's 250ms/request delay is conservative.

### The David Lean Cinema (`src/scrapers/cinemas/david-lean.ts` + test)
- **Bug 1**: "special screening" announcement blocks put an intro sentence on the block's first line and embed the real film title *after* the showtime on each date line (`"Wed 05 August at 7.00pm - ALL OF US STRANGERS plus Q&A"`). The parser used the block's first line as the title for every date in the block, producing "films" literally named after announcement sentences. Fixed with `splitEmbeddedTitle()`, which detects the `" - "` separator and prefers the embedded title.
- **Bug 2**: the DOM filter that decides which page elements look like listings required minutes after "at" (`at\s+\d{1,2}[.:]\d{2}\s*(am|pm)`). A bare-hour time like "11am" (no minutes) caused the *entire* listing block to be silently dropped before parsing — this is how "Toy Story 5" disappeared entirely from the DB despite screenings existing immediately before and after it. Fixed by making the minutes group optional.
- **Code-review finding, fixed**: the original regression test for Bug 2 called `parseListingText()` directly, which never runs the DOM-filter regex — so the test passed identically on the pre-fix code and provided no real coverage. Extracted the filter regex into an exported, hand-synced twin function (`isListingCandidateText`, documented as needing to stay textually identical to the inline copy inside `page.evaluate()`, since that callback runs in the browser and can't import it directly) and added a test exercising the real Toy Story 5 string against it.
- **Code-review finding, fixed**: `splitEmbeddedTitle()`'s `" - "` detection would misread a normal time-*range* listing (e.g. `"10.00am - 12.00pm"`) as an embedded title, treating the end time as a film name and silently dropping the screening. Added a guard rejecting a "title" that itself looks like a time.
- **DB cleanup** (confirmed errors, not a heuristic guess): deleted 2 sentence-title "film" rows and re-associated their screenings to the correctly TMDB-matched real films (resolved via the tinyurl booking links) — All of Us Strangers (5 Aug) and Come See Me in the Good Light (18 Aug). Also resolved 4 phantom duplicate screenings at midnight UTC (a pre-existing artifact from an earlier parsing era) that had no live counterpart — the correct same-day showing already existed in each case, so zero coverage was lost.

### Screen on the Green (`src/config/cinema-registry.ts`)
- Stored venue URL was missing "everyman-" in the slug (`.../x077o-screen-on-the-green` → 404s); corrected to `.../x077o-everyman-screen-on-the-green`. This field feeds the frontend's booking-link fallback (`cinema.bookingUrl || cinema.website`), so it was a real dead link, not just cosmetic.

### Investigated, confirmed NOT bugs
- **Curzon Mayfair** (58 screenings/20 films in DB vs. 2 films on the live day-view): sourceIds are correctly venue-prefixed (`MAY1`), rows are freshly scraped, and the "2 films" the live-verify agent saw was just Curzon's ~1-week day-view — the rest is legitimately-published event cinema (Met Opera, Curzon Film 50, RBO) booked months ahead via film pages the day-view doesn't surface.
- **Screen on the Green's overcount** (35/11 vs. 1 live): the "extra" films are genuine event-cinema screenings 17–20 days out, outside the live widget's 10-day visible window — not stale data.

## Verification
- `npx tsc --noEmit` clean; `eslint` clean on all changed files.
- Local vitest workers wedge on this machine (documented disk-pressure issue) — verified logic directly via a `tsx` smoke script exercising every changed code path (`isListingCandidateText`, the time-range guard, the INDY `horizonDays` override at both the venue-set and venue-unset paths) plus the two agents' own live dry-run scrapes and curl checks. CI is the authoritative test gate.
- Independent `code-reviewer` agent pass run before this PR per the project's PR review gate (3+ files changed) — its two real findings (untested regression, time-range false positive) are fixed above; its other observations (live API/URL spot-checks) confirmed the changes correct.

## Impact
- Chiswick's catalog will expand from 16 to ~66 films on next scrape.
- David Lean's Toy Story 5 screenings and correctly-titled special screenings will appear on next scrape.
- Rich Mix and Bertha DocHouse booking links are already corrected in production (both scrapers were run to completion by the investigating agent).
- Screen on the Green's cinema page link now resolves instead of 404ing.
