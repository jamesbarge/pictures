# Savoy JSON adapter — Rio migration + empty-success P0 fix (Coverage Phase 2b, PR 1)

**PR**: #729
**Date**: 2026-07-14
**Plan**: `docs/plans/2026-07-13-coverage-implementation-plan.md` (Phase 2b)

## Summary

Extract a shared Savoy Systems **modern-JSON** client and migrate Rio onto it, folding in
Rio's empty-success P0 fix. First of the Phase 2b "Track A" PRs (Lexi migration + the Arzner
direct scraper follow).

## Research finding that reshaped Phase 2b

Savoy Systems ships **two distinct front-ends**, and the handoff plan conflated them:

- **Modern JSON** — homepage embeds `var Events = {"Events":[…]}`. Verified live for **Rio,
  Lexi, The Arzner**.
- **Legacy HTML-table** — `div.programme` / `TcsProgramme_` server-side tables, **no
  `var Events`**. **Ciné Lumière, ArtHouse Crouch End** — these need a *separate* table
  parser and can't use this client.

Three playbook labels were wrong (verified live): **Lexi is Savoy modern-JSON, not "Admit
One"**; **the Arzner is Savoy modern-JSON (`TheArzner.dll`), not "Jacro"** (so a direct
scraper is trivial and will replace its L-CUT gap-fill feed); **Castle is Wagtail + Admit
One, not Jacro**. Building one blind "Savoy adapter" for all of them would have repeated the
Phoenix-isn't-INDY mistake.

## Changes

### `src/scrapers/platforms/savoy.ts` (new)
- `extractSavoyEventsJson(html, cinemaId)` — brace-matched extraction of the `var Events`
  blob (respects string literals/escapes); **THROWS** if missing or unbalanced.
- `parseSavoyEvents(html, venue, now?)` — async; maps future performances to `RawScreening`,
  UK-local `StartTime` HHMM via `combineDateAndTime`, `sanitizeRuntime`, year/director,
  festival detection, and an optional `filmTypeOnly` (`TypeDescription==="Film"`) filter.
- `SavoyVenue` injects per-venue `buildSourceId` / `buildBookingUrl` + `filmTypeOnly`, so the
  parser is shared while each venue keeps its exact sourceId scheme.

### `src/scrapers/cinemas/rio.ts`
- `parsePages` now delegates to `parseSavoyEvents`; the ~90 lines of inline extraction +
  mapping are gone. Still `extends BaseScraper` (keeps its `fetchUrl` headers/retry).
- **P0 fixed**: a missing/malformed `var Events` blob now throws (→ the run records a venue
  failure) instead of returning `[]` — no more silent empty-success masking a broken scrape.
- sourceId (`rio-dalston-{event.ID}-{ISO}`) + booking URL (`Rio.dll/WhatsOn?f={ID}`) preserved
  exactly → no reconcile.

### `src/scrapers/platforms/savoy.test.ts` (new)
- Mapping (sourceId/booking/screen/year/director/runtime incl. string), past-drop, BST→UTC,
  `filmTypeOnly`, nested-brace extraction, and both throw paths (missing marker + bad JSON).

### `SCRAPING_PLAYBOOK.md`
- New "Savoy Systems platform" section (two-template distinction, venue mapping, the label
  corrections). Rio + Lexi sourceId rows annotated.

## Verification

- Fixture smoke (tsx, DB-backed FestivalDetector): all pass.
- **Live** Rio scrape via the real scraper's `scrape()` (fetch + parse, no DB write): **57
  future screenings**, `rio-dalston-{id}-{ISO}` sourceIds, `Rio.dll/WhatsOn?f={id}` booking
  URLs — behaviour preserved.
- eslint clean; `tsc --noEmit` clean; CI is the authoritative gate for the unit suite.
- code-reviewer agent run on the diff.

## Impact

- Rio can no longer silently report a successful empty scrape (the P0). The shared client
  unblocks the Lexi migration (corrects its mislabel) and the Arzner direct scraper (upgrades
  it from L-CUT gap-fill to first-party) — both follow as their own PRs.
- No sourceId change → no reconcile, no duplicates.
