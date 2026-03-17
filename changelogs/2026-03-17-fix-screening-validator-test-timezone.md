# Fix screening validator test timezone sensitivity

**PR**: #396
**Date**: 2026-03-17

## Changes
- Fixed `makeScreening()` test helper to create screenings at 2 PM tomorrow instead of using `Date.now() + 86400000`
- The old approach preserved the current hour, which in CI (~2 AM UTC) produced screenings rejected by `MIN_SCREENING_HOUR` (10 AM) validation

## Impact
- Fixes the "Unit & Integration Tests" CI failure that has been red across all recent PRs (#386–#395)
- All 858 tests now pass deterministically regardless of execution time
