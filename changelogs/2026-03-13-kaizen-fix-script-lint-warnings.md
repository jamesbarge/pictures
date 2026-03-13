# Kaizen — Fix Lint Warnings in Scripts

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- scripts/generate-favicons.mjs: Removed unused writeFileSync import
- scripts/fix-contaminated-booking-urls.ts: Removed unused sql import + unused result variable
- scripts/fix-pcc-time-and-dupes.ts: Removed unused deleted variable
- scripts/fix-contaminated-booking-urls-v2.ts: Removed unused CURZON_SLUGS constant (12 lines)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
