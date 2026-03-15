# Kaizen — extract status helpers in festivals list route

**PR**: #365
**Date**: 2026-03-15

## Changes
- Extracted computeFestivalStatus() and computeTicketStatus() pure helper functions from the inline .map() callback in the festivals list API route
- Replaces 35 lines of inline date comparison + conditional logic with 2 function calls
- Mirrors the extraction done in PR #363 for the [slug] detail endpoint

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
