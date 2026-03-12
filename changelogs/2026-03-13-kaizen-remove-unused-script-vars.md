# Kaizen — Remove Unused Variables and Imports in Scripts

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- front-end-audit.ts: Removed unused CinemaListEntry, FilmDetailData type imports + unused BASE_URL constant
- report-generator.ts: Removed unused CinemaDetailData type import
- booking-checker.ts: Removed unused CINEMA_BOOKING_DOMAINS constant (7 lines)
- cleanup-duplicate-films.ts: Removed unused eq import

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
