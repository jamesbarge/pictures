# Kaizen — Extract retryFailedChecks from booking checker

**PR**: #378
**Date**: 2026-03-16

## Changes
- Extracted the retry pass (42 lines) from `checkBookingLinks()` into a standalone `retryFailedChecks()` function
- The new function handles stealth escalation, budget tracking, and result updates for failed booking URL checks
- `checkBookingLinks` now reads as a clear two-phase pipeline: first pass → retry failures → return

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
