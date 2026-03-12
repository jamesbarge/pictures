# Kaizen — Extract TMDB Match Scoring Constants

**PR**: #238
**Date**: 2026-03-13

## Changes
- Extracted 14 magic numbers from the TMDB film matching algorithm in `src/lib/tmdb/match.ts` into named constants
- Constants cover: search limits, similarity thresholds, scoring weights, year bonuses, popularity caps, competition penalties, confidence thresholds, and rate limiting

## Impact
- Code quality improvement, no behavior changes
- Makes the matching algorithm self-documenting — each tuning parameter now has a descriptive name
- Kaizen category: extract-constant
