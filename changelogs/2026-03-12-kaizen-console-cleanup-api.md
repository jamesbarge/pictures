# Kaizen — Remove debug console.logs from API routes

**PR**: #180
**Date**: 2026-03-12

## Changes
- `src/app/api/travel-times/route.ts`: Removed ungated `Attempting walking fallback for N destinations` debug log
- `src/lib/posters/service.ts`: Removed ungated `  -> AI cleaned title:` debug log

## Impact
- Reduces production log noise from API request paths
- Both were debug-level messages without structured `[Tag]` prefixes
- Code quality improvement, no behavior changes
- Kaizen category: console-cleanup
