# Kaizen — Extract festival status helpers

**PR**: #363
**Date**: 2026-03-15

## Changes
- Extracted `computeFestivalStatus()` and `computeTicketStatus()` from inline conditionals in the festivals GET handler
- Both are pure functions: festival status compares now vs start/end dates; ticket status compares now vs sale dates

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
