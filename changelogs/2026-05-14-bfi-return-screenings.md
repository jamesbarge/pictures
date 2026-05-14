# BFI scraper returns venue-filtered screenings so /scrape records them properly

**PR**: TBD
**Date**: 2026-05-14

## Summary

Follow-up to #489. That PR successfully routed BFI through the working PDF importer path, but `BFIScraper.scrape()` returned `[]` because `runBFIImport` was saving screenings directly via its own DB path. The consequence: every entry in `scraper_runs` had `status=success, screening_count=0`, which is the exact pattern the silent-breaker detector quarantines as broken.

After #489 the silent-breaker check flagged both BFI venues:

```
=== Silent-breaker health check ===
2 cinema(s) flagged:
  bfi-imax (BFI IMAX) — 2 consecutive zero-yield runs
  bfi-southbank (BFI Southbank) — 2 consecutive zero-yield runs
```

The BFI data was in the DB. The accounting was wrong.

## Changes

### `bfi-pdf/importer.ts` — new `loadBFIScreenings()` export

Splits the fetch + parse + merge steps from the save step:

```ts
export async function loadBFIScreenings(): Promise<{
  screenings: RawScreening[];
  pdfInfo: { label: string; contentHash: string } | undefined;
  sourceStatus: { pdf: SourceStatus; programmeChanges: SourceStatus };
}>;
```

Returns merged screenings (PDF + programme changes, both venues) without persisting anything. `runBFIImport` is unchanged — it still calls the same primitives (fetchLatestPDF + parsePDF + fetchProgrammeChanges + mergeScreenings) and then does `saveByVenue` + run-record persistence.

Also promoted `getVenueKey` to a named export `getBFIVenueKey` so callers can filter screenings to a specific venue without duplicating the IMAX-detection logic.

### `cinemas/bfi.ts` — return venue-filtered screenings

`BFIScraper.scrape()` now:
1. Calls `getOrLoadBFIScreenings()` (cached) to get merged screenings for both venues
2. Filters by `getBFIVenueKey(s) === this.config.cinemaId`
3. Returns the filtered slice

The unified pipeline then processes them through its standard path:
- `pipeline.ts` calls `getOrCreateFilm` + `insertScreening` for each
- `scraper_runs` records `screening_count` matching the array length
- Silent-breaker detector sees a real count and doesn't quarantine

The module-scope `bfiLoadPromise` cache means the PDF is fetched + parsed once per process; the second venue invocation just filters the same cached array.

## Trade-off considerations

Double-write risk: if someone runs both `npm run scrape:bfi-pdf` AND `/scrape` in the same session, the screenings get saved twice — once via `runBFIImport`'s `saveByVenue`, once via the unified pipeline. `saveScreenings` is idempotent (upsert on the unique index), so this is safe; the second write is a no-op update.

## Verification

- `npx tsc --noEmit` — clean
- `npm run test:run` — 910/910 pass
- `npm run scrape:bfi` — BFI Southbank: 94 screenings returned to pipeline, `screening_count=94` in scraper_runs (was 0)
- BFI IMAX still 0 — see follow-up below

## Known follow-up: BFI IMAX still returns 0

The PDF parser uses title-first ordering (`title → metadata → screenings`) which matches the BFI Southbank section format. The BFI IMAX section at the end of the PDF uses **screening-first** ordering:

```
SAT 30 MAY 13:00 BFI IMAX        ← screening line
E.T. the Extra Terrestrial       ← film title
USA 1982. Director Spielberg.    ← metadata
```

`tryParseFilm` walks forward from a title line and only attaches *subsequent* screening lines. The leading screening for an IMAX entry is never associated with E.T. and the film is never added to the parsed output. The IMAX section's films also tend to have richer descriptive copy ("Visit the BFI IMAX website for information on...") that intercedes between the screening and the title.

Fix would require a second pass that walks the structure in reverse for IMAX-tagged entries, or recognising the IMAX section's specific layout. Documented in `tasks/` for a follow-up.

In the meantime, BFI IMAX retains 63 screenings from prior scrapes (no regression).
