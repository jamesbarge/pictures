# Kaizen — Rename single-letter vars in booking-checker titleConfidence

**PR**: #167
**Date**: 2026-03-12

## Changes
- `src/trigger/qa/utils/booking-checker.ts`: Renamed `a`/`b` to `normalizedDetected`/`normalizedExpected`, `aTokens`/`bTokens` to `detectedBigrams`/`expectedBigrams`, `t` to `bigram` in `titleConfidence()`

## Impact
- Code quality improvement, no behavior changes
- Makes the bigram overlap algorithm's intent clearer at a glance
- Kaizen category: naming
