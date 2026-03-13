# Kaizen — Remove Dead TikTok Filtering Variables

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- `scripts/social-outreach/apify-runner.ts` — Removed 3 dead variables (hasLondonSignal, isFromLondonHashtag, combinedText) and related comments in TikTok scraping method. These were computed but never used for filtering.

## Impact
- Code quality improvement, no behavior changes
- Reduces lint warnings from 36 to 34
- Kaizen category: dead-code
