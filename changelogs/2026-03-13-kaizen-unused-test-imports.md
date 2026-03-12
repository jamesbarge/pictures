# Kaizen — Remove Unused Test Imports

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- `festival-detector.test.ts`: Removed unused `FESTIVAL_CONFIGS` import
- `dismiss-button.test.ts`: Removed unused `vi` import (no mocks in this test)
- `fixtures.ts`: Removed unused `TimeOfDay` and `ProgrammingType` type imports

## Impact
- Code quality improvement, no behavior changes
- Reduced lint warnings from 64 to 61
- Kaizen category: lint-fix
