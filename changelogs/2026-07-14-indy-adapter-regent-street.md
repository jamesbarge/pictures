# INDY GraphQL adapter — Regent Street direct-fetch migration (Coverage Phase 2a, PR 1)

**PR**: TBD
**Date**: 2026-07-14
**Plan**: `docs/plans/2026-07-13-coverage-implementation-plan.md` (Phase 2a)

## Summary

Extract a shared INDY Systems GraphQL client and migrate Regent Street Cinema onto it,
replacing fragile Playwright response-interception with a deterministic direct `fetch()`.
This is the first of two Phase 2a PRs (PR 2 adds The Chiswick Cinema on the same adapter).

## Research finding that reshaped Phase 2a

The handoff plan grouped Regent Street **and Phoenix** under the INDY adapter (following a
stale comment in `regent-street.ts`: "Same platform as Phoenix Cinema"). Live investigation
disproved this:

- **INDY `/graphql` is open and directly callable** — a plain POST with `circuit-id` /
  `site-id` headers returns showings; no auth token, cookie, or CSRF. Proven end-to-end with
  curl for Regent Street (19/85) and Chiswick (56/170). So Playwright is removed entirely,
  not worked around.
- **Phoenix is NOT on INDY** — `phoenixcinema.co.uk/graphql` 302s; it's an ASP.NET `.dll`
  system (`PhoenixCinemaLondon.dll`). Phoenix is therefore **out of the INDY adapter's
  scope**; its DOM-heuristic P0 is a separate assessment (alongside the `.dll`/Savoy work).

So Phase 2a narrows to: Regent Street migration (this PR) → Chiswick (next PR).

## Changes

### `src/scrapers/platforms/indy.ts` (new)
- `fetchIndyShowings(venue, opts)`: loops dates today…+N (35-day default), POSTs
  `showingsForDate(date, siteIds)`, dedupes by showing id, keeps only
  `published && !past && !private && !isPreview` future showings, maps to `RawScreening`.
- `checkIndyHealth(venue)`: a today `showingsForDate` POST against the real dependency.
- `postShowingsForDate` retries (3×) then **throws** on HTTP / GraphQL / INDY error — never
  swallowed as empty success (playbook failure semantics).
- Injectable `fetchImpl` / `now` / `days` / `attempts` seams → fully unit-testable, no
  browser or network.

### `src/scrapers/cinemas/regent-street.ts`
- Deleted the Playwright launch + `page.on("response")` interception + 20s/3s timer promise.
- Now a thin `CinemaScraper` delegating to `fetchIndyShowings(REGENT_STREET_VENUE)` and
  `checkIndyHealth`. Removed the stale "same platform as Phoenix" comment.
- **sourceId unchanged** (`regent-street-{showing.id}`) — no reconcile needed. Booking URL
  upgraded from `/movie/{slug}` to the `/checkout/showing/{id}` deep-link;
  `timeSource:"iso"`; runtime + year now populated from the payload.

### `src/scrapers/platforms/indy.test.ts` (new)
- Fixture test off the real captured payload: mapping (sourceId / booking / iso / runtime /
  year), dedup, and every filter (past / unpublished / private / preview / before-now); plus
  throw-on-INDY-error and throw-on-non-ok-HTTP.

### `SCRAPING_PLAYBOOK.md`
- New "INDY Systems platform" section (endpoint, headers, query, mapping, failure semantics,
  known venue ids, the Phoenix-is-not-INDY correction).

## Verification

- Fixture smoke (tsx, DB-free): 7/7.
- **Live**: `fetchIndyShowings` against the real Regent Street endpoint — healthCheck green,
  25 screenings / 14-day horizon, 6 distinct films, 0 sub-09:00-London times, sensible date
  range, sourceIds/booking URLs correct.
- eslint clean; `tsc --noEmit` clean; CI is the authoritative gate for the unit tests
  (local vitest worker pool wedges on this machine).

## Impact

- Regent Street coverage is now deterministic and browser-free — no more 20s/3s timing races
  that could silently under-capture. Faster, more complete (explicit 35-day date loop).
- No sourceId change → existing rows update in place (booking URL improves; no duplicates).
- Reusable `platforms/indy.ts` unblocks Chiswick (PR 2) and any future INDY venue.
