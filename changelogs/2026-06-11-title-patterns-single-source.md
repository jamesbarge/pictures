# Canonical Title Patterns and Entity Decoding

**PR**: #666
**Date**: 2026-06-11

## Changes
- Established `src/lib/title-extraction/patterns.ts` as the single source for shared event-prefix, suffix, non-film, festival, and live-broadcast detection data.
- Re-exported those definitions through `src/lib/title-patterns.ts` and added shared helpers for matching literal event prefixes.
- Promoted HTML entity decoding into `src/lib/title-patterns.ts`, covering common named entities, decimal and hexadecimal numeric references, fractions, and HTML-encoded UTF-8 mojibake.
- Updated enrichment, cleanup, patrol, poster-backfill, sync extraction, analysis, and browser-audit code to use the canonical decoder and patterns.
- Replaced the broad private non-film classifiers in the destructive upcoming-film audit paths with the curated `getKnownNonFilmType` contract.
- Normalized learned non-film types to the supported `concert`, `event`, and `live_broadcast` values before database writes.
- Added regression coverage for shared prefix matching, poster-backfill cleanup, numeric entities, punctuation entities, and mojibake repair.
- Ported the 24-hour deletion guard from `runNonFilmDetection` into the CLI
  audit orchestrator's Pass 2, so `npm run audit:fix-upcoming -- --execute`
  reclassifies same-day scrapes instead of hard-deleting them.
- Removed a redundant script-level entity decode in `enrich-upcoming-films.ts`
  (`cleanFilmTitle` decodes internally); the standalone decode remains only
  for step-attribution telemetry.

## Impact
- Pattern additions and entity-decoding fixes now propagate consistently across scraper enrichment, maintenance scripts, and audits.
- Destructive data-quality passes no longer delete films solely because a broad private regex such as `workshop` or `masterclass` matched their title.
- Poster and TMDB backfills make the same title-cleaning decisions as the canonical extraction layer.
