# Listings QA — Garden bilingual titles, Genesis strand

**PR**: #854
**Date**: 2026-10-27

## Changes
- Garden listings in the form `Original title (English title)` store the English title. The live row `La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai Cortés)` becomes `The Flamenco Guitar of Yerai Cortés`. `El canto de las manos (Song of the Hands)` becomes `Song of the Hands`. The source id still slugs the listed string.
- A Savoy performance listed under both shapes keeps the English title. The booking page for `TcsPerformance_6223527` is `In-Edit Cine-Documental: … (The Flamenco Guitar of Yerai Cortés) (PG)`, which exact title equality did not match, so the earlier shared-performance guard kept both rows.
- Genesis peels the exact strand `Seasonal Affective Cinema`. `The Crow - Seasonal Affective Cinema` stores `The Crow` and the strand is the screening note. `Raft - A London Story` and `Rammstein - Live in Mexico City` are unchanged.
- `scripts/repair-listings-qa-2026-10-27.ts` rewrites rows already stored. Dry-run unless `--execute`. It does not delete film rows and was not run against production.

## Impact
- The next Garden scrape of this showing attaches to the TMDB film instead of creating another film from the bilingual title. The repair removes the extra screening already stored.
- The next Genesis scrape of perfCode 13797 stores The Crow and keeps the strand on the screening. The repair does the same for the row already stored.
