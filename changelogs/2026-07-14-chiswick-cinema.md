# Add The Chiswick Cinema (INDY) + reclassify Regent Street (Coverage Phase 2a, PR 2)

**PR**: #728
**Date**: 2026-07-14
**Plan**: `docs/plans/2026-07-13-coverage-implementation-plan.md` (Phase 2a)

## Summary

Add The Chiswick Cinema on the shared INDY adapter built in PR 1 (#727), and finish
reclassifying Regent Street now that it's an API scraper, not a Playwright one.

## Changes

### New venue: The Chiswick Cinema
- `src/scrapers/cinemas/chiswick.ts` — thin `CinemaScraper` delegating to
  `fetchIndyShowings(CHISWICK_VENUE)` (INDY circuit 56 / site 170, `chiswickcinema.co.uk`).
- `src/scrapers/cinemas/chiswick.test.ts` — pins the venue wiring (ids, domain, headers,
  `chiswick-cinema-{id}` sourceId prefix). The mapping/filters are covered in
  `platforms/indy.test.ts`.
- Registered in FOUR places:
  - `src/config/cinema-registry.ts` — CinemaDefinition (94-96 Chiswick High Rd, W4 1SH,
    Hounslow, coords 51.4931/-0.251, 5 screens, `scraperType: "api"`).
  - `src/scrapers/registry.ts` — cheerio/API wave entry.
  - `src/scrapers/task-registry.ts` — `chiswick-cinema → scraper-chiswick`.
  - `src/db/seed-cli.ts` `LONDON_CINEMAS` — for coordinates + full metadata (see below).

### The `seed-cli` entry IS needed — for the map pin (caught in review)
Screening *flow* doesn't need it: the runner factory calls `ensureCinemaExists(config.venue)`
on every scrape, creating the identity row from the registry (this is why Regent Street's
screenings work without a `LONDON_CINEMAS` entry). BUT `ensureCinemaExists` persists only
`id/name/shortName/chain/website/address/features` — NOT `coordinates` — and the map
(`CinemaMap.svelte`) filters out cinemas with null coordinates. So without a `LONDON_CINEMAS`
entry, Chiswick would show in the list/calendar with screenings but have **no map pin** and
missing screens/programmingFocus/bookingUrl/description. `seedCinemas()` upserts
(`onConflictDoUpdate` incl. `coordinates`), so `db:seed:cinemas` writes the full metadata
idempotently regardless of scrape order. (The older "scraped venues skip seed-cli" idea was
right for screening flow, wrong for map/metadata.)

### Regent Street reclassification (PR 1 follow-up)
- `cinema-registry.ts`: `scraperType` `playwright` → `api`.
- `scrapers/registry.ts`: moved from the Playwright wave to the cheerio/API wave — it no
  longer launches a browser, so it shouldn't occupy a "browser" slot in the memory-bounded
  Playwright wave.

## Verification

- Live (read-only) Chiswick scrape: **150 screenings / 10-day, 16 films, 0 sub-09:00-London
  times**, `chiswick-cinema-{id}` sourceIds, `chiswickcinema.co.uk/checkout/showing/{id}`
  booking URLs. Registry wiring verified end-to-end (SCRAPER_REGISTRY entry, no duplicate
  taskIds, `getScraperByCliId('chiswick')`, `getVenueFromRegistry`, task-registry map).
- eslint clean; `tsc --noEmit` clean; CI is the authoritative gate for the unit suite.
- code-reviewer agent run on the diff.

## Impact

- The Chiswick Cinema goes live on the next `/scrape` (auto-seeds + populates). A ~5-screen
  commercial + arthouse venue in west London — meaningful coverage.
- Regent Street's registry classification is now honest (API, cheerio wave).
- No new dependencies; sourceId schemes unchanged for existing venues.

## Post-merge

1. Run `npm run db:seed -- --cinemas` so Chiswick gets its coordinates + full metadata (the
   scrape auto-creates only the identity row). Then confirm the **map pin** renders.
2. On the next `/scrape`, confirm `chiswick-cinema` appears with screenings on
   pictures.london (list + calendar).
