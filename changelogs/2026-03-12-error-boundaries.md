# Styled Error Boundaries for Subpages

**Date**: 2026-03-12
**Type**: Enhancement
**PR**: #XX

## Summary
Added branded error boundary components to 6 subpages for graceful error handling.

## Changes
- **New**: `src/app/settings/error.tsx`
- **New**: `src/app/watchlist/error.tsx`
- **New**: `src/app/map/error.tsx`
- **New**: `src/app/reachable/error.tsx`
- **New**: `src/app/letterboxd/error.tsx`
- **New**: `src/app/film/[id]/error.tsx`

## Design
- Each error boundary reports to PostHog with try/catch safety (won't crash if PostHog is unavailable)
- Displays ":(" emoticon, "Something went wrong" message, "Try again" and "Go home" buttons
- Development-only expandable error details section
- Uses project design tokens for consistent styling
