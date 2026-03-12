# Kaizen — Lint-fix unused vars/imports in scripts (5 files)

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- scripts/fix-contaminated-booking-urls-v2.ts: Removed unused CURZON_SLUGS constant (12 lines)
- scripts/fix-contaminated-booking-urls.ts: Removed unused sql import
- scripts/fix-pcc-time-and-dupes.ts: Removed unused deleted variable assignment
- scripts/generate-favicons.mjs: Removed unused writeFileSync import
- scripts/social-outreach/apify-runner.ts: Removed unused hasLondonSignal, isFromLondonHashtag, combinedText vars (11 lines)

## Impact
- Code quality improvement, no behavior changes
- ESLint warnings reduced from 49 to 44
- Kaizen category: lint-fix
