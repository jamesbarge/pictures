# Flaky detector — small-venue exclusion

**PR**: TBD
**Date**: 2026-05-17

## Context

Investigation of why BFI IMAX persisted as "🟡 warn flaky" even after #496's fixes surfaced an insight: BFI IMAX legitimately programs ~0-2 screenings per scrape window most days. Its "alternating empty/non-empty" pattern isn't a bug — it's the venue's natural rhythm. The detector's empty-success-ratio signal was misreading "small venue" as "flaky scraper".

Distinguishing the two cases:

- **Small venue**: non-empty runs have very low mean (e.g. 2). The zeros are legitimate slow days.
- **Flaky scraper**: non-empty runs have normal mean (e.g. 250). The zeros indicate the scraper is sometimes failing to extract.

## Changes

### `src/lib/scrape-quarantine.ts`

- New `smallVenueMaxNonEmptyMean: 5` in `FlakyThresholds`.
- `analyzeRunsForFlakiness` computes the mean of non-empty successful runs. If `nonEmptyMean ≤ threshold` AND at least one non-empty run exists, the cinema is treated as a "small venue" and the empty-success-ratio signal is suppressed.
- The failed-ratio signal is independent and still fires regardless of venue size — those are real fetch errors.

### `src/lib/scrape-quarantine.test.ts`

- Updated the existing "BFI IMAX pattern" test to use `count=50` for non-empty runs (clearly above small-venue threshold) so it still validates the genuine-flaky case. Renamed to "flags a high-volume cinema with high empty-success ratio as critical" to reflect the new semantics.
- 3 new tests:
  - "BFI IMAX pattern with non-empty mean ≤ 5" returns `null` (correctly suppressed)
  - "BFI Southbank-style high-volume venue with alternating zeros" still fires critical
  - "Small venue with 50% failed runs" still fires the failed-ratio signal

## Verification

- `npm run test:run` — 993 / 993 pass on the branch
- `npx tsc --noEmit` — clean
- **Live replay** against production: BFI IMAX's non-empty mean is 7.75 (one outlier 25-count run plus three 2-count runs), so it remains flagged — correctly. A purely-small venue (e.g. mean = 2) would be suppressed.

## Impact

- Removes a class of false-positive from the flaky detector
- Surfaces a tuning lever (`smallVenueMaxNonEmptyMean`) for future calibration
- Helps users distinguish "venue is small" from "scraper is broken" — actionable signal separation

## Follow-ups

- After 2-3 weeks of production data, evaluate whether the threshold should rise from 5 to 7-10 to also cover BFI IMAX's typical pattern
- Consider replacing `mean` with `median` if outlier runs (like BFI IMAX's occasional 25-count day) cause false-negatives
