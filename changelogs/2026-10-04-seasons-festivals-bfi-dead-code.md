# Delete dead seasons, festivals and BFI PDF code

**PR**: #790
**Date**: 2026-10-04

## Changes
- Festivals: deleted the unimported `festivals/index.ts` barrel, the programme watchdog (`watchdog.ts`, `WATCHDOG_PROBES`, `WatchdogProbe`), `getAllFestivalConfigs`, `getFestivalConfigsForVenue` and `scrapeActiveEventiveFestivals` with their tests. The watchdog lost its caller with the Trigger.dev task in #469 and the Eventive ingest lost its Bree job in #472. `TaggingResult.postWriteFailures` went with the ingest, its only producer. The Eventive client now waits with `setTimeout` from `node:timers/promises`.
- Seasons: deleted the unimported `seasons/index.ts` barrel, `mergeSeasonSources`, `clearSeasonCache`, `relinkSeasonFilms`, the `SeasonScraperResult` type, the single-implementer `SeasonScraper` interface and the `createXSeasonScraper` factories. Dropped `requestsPerMinute`, `seasonSlugs`, `RawSeason.sourceId` and `RawSeasonFilm.filmUrl`, which every scraper set and nothing read.
- Seasons: the five runners (`run-{bfi,pcc,ica,barbican,close-up}-seasons.ts`, 253 lines that differed only in import and log label) are one `run-seasons.ts <venue>`. The `scrape:bfi-seasons`, `scrape:close-up-seasons`, `scrape:barbican-seasons`, `scrape:pcc-seasons` and `scrape:ica-seasons` scripts call it with their venue.
- Seasons: four `resolveUrl` copies became one `BaseSeasonScraper.resolveUrl` using `new URL(url, baseUrl + "/")`, which gives identical output for absolute, root-relative and relative paths (including BFI's `/Online` base) and also resolves `//cdn` paths. Seven year-from-title copies became one `splitYear` with the same regexes. Removing `sourceId` left the base class `generateSlug` without callers, so the pipeline's copy is now the only one.
- Removed the `link:seasons:directors` script, whose target `scripts/link-seasons-by-director.ts` never existed.
- BFI PDF: deleted `cleanup.ts` (the BFI ghost cleanup, whose scheduler caller went in 2ff393d3), `fetchAllRelevantPDFs`, `parsePDFFromPath`, the `getVenueKey` alias and the importer's `scrape()`. The `bfi-pdf/index.ts` barrel now exports only `loadBFIScreenings`, `getBFIVenueKey`, `runBFIImport` and `runProgrammeChangesImport`.
- BFI PDF: both parsers dropped fields that were filled and never read: original title, cast, runtime, certificate, countries, description and season in the PDF parser; notes, cast, runtime, countries, accessibility flags and page references in the programme-changes parser; and `parseErrors`, which was always empty. `programme-changes-parser.ts` now exports the one `VENUE_MAP`, `MONTHS` and `cleanBfiTitle` that `pdf-parser.ts` imports.

## Impact
- No change for pictures.london users, `npm run scrape` or the BFI Playwright fallback. Every deleted symbol had zero callers outside its own module and tests, across `src/`, `scripts/`, workflows and the slash commands.
- The five `scrape:*-seasons` scripts were checked without running them: a scratch script confirmed each one maps to the right scraper class and cinema ID through `run-seasons.ts`.
- Still in place by request: the seasons feature, the Eventive dry-run route `POST /api/admin/festivals/scrape-eventive`, the reverse-tagger and the standalone BFI import path (`scrape:bfi-pdf`, `scrape:bfi-changes`, `POST /api/admin/bfi-import`).
- Left for later: the ScraperAPI branches in the BFI fetchers and folding `runBFIImport` onto `loadBFIScreenings`.
