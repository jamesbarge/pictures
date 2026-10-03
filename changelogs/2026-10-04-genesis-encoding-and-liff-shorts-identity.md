# Genesis encoding, dated-panel rollover and LIFF shorts identity

**PR**: #776
**Date**: 2026-10-04

## Changes
- **Festival-tagged numbered titles keep their number** (`src/lib/title-patterns.ts`). `readTrailingNumber` peels a trailing upper-case tag after a dash (` - LIFF`, 2-6 capitals) in the same loop that peels trailing brackets. A tag that is a canonical Roman instalment (` - IV`) is kept. The Roman check moved into `instalmentRoman()` with unchanged behaviour. Genesis titles its London Independent Film Festival shorts programmes `Shorts Block N - LIFF`; with `LIFF` read as the last token every block carried no number, and `findMatchingFilm` merged Shorts Blocks 2-12 into one `Shorts Block 11 - LIFF` film at 78-83% in the 2026-10-03 run. Of the 32 film titles ending in ` - TAG` on 2026-10-04, only that one gains a number.
- **Charset-aware decoding** (`src/scrapers/cinemas/genesis.ts`). genesiscinema.co.uk sends Windows-1252 bytes under `content-type: text/html; charset=ISO-8859-1`, beneath a `<meta charset="UTF-8">` that is wrong. `response.text()` decoded UTF-8 and stored U+FFFD for every `’`, `£` and `–`. New `decodeBody()` decodes with the header charset (the WHATWG decoder maps ISO-8859-1 to windows-1252) and falls back to UTF-8.
- **Dated panels never roll forward a year** (`src/scrapers/cinemas/genesis.ts`). Panel ids carry the year (`panel_20261003`), yet `parseDateTime` moved any past showing into next year, emitting a phantom screening 364 days out that the validator rejected as `too_far_future` on every run. Only yearless dates roll now; a showing earlier the same day is dropped by `validate()`.
- Tests: new `src/scrapers/cinemas/genesis.test.ts` (decoding, a Windows-1252 `scrape()` replay, rollover) and new cases in `src/lib/film-similarity-sequel.test.ts`. Playbook: Genesis site note and an addendum to the sequel-safe section.

## Impact
- L-CUT parity reported 10 Genesis listings missing. Every one was already in the DB at the exact same instant. After a Genesis re-scrape, 9 of them resolve to their own films; the 10th (`Steel on Film` on L-CUT, `Steel of Film (in 35 mm) + Q&A` on the venue's site) is a source-side spelling difference and stays as one parity miss. Simulated parity against the fixed scraper's output: 94/95.
- Verified live on 2026-10-04: 113 of 113 published perfCodes captured, and the category strands (`/whatson/*`) add no event or showing beyond `/whats-on/`.
- Not repaired by a re-scrape: the 9 stored film titles carrying U+FFFD. `normalizeTitle` strips both `’` and U+FFFD, so the corrected title hits the existing row in the film cache. Those titles need a one-off update.
- Not addressed: the `festivals` table has no LIFF row, so LIFF showings store `is_festival_screening = false`. `genesis-v2.ts` (dev runner only) keeps both scraper bugs.
