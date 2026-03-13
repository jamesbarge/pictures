# Kaizen — Remove Dead Code in Stores

**PR**: #275
**Date**: 2026-03-13

## Changes
- Deleted `getTravelModeInfo()` from reachable.ts — helper with zero callers
- Removed `export` from `ConsentStatus` type in cookie-consent.ts — only used internally
- festival.ts dead functions (useFestivalsWithNotification, useScheduleConflicts) were targeted but auto-formatter reverted — will need Python write approach

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
