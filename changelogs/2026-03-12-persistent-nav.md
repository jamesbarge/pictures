# Persistent Navigation on Subpages

**Date**: 2026-03-12
**Type**: Enhancement
**PR**: #XX

## Summary
Replaced per-page "Back to Calendar" links with a shared `SubpageNav` component that provides consistent navigation across all subpages.

## Changes
- **New**: `src/components/layout/subpage-nav.tsx` — lightweight header showing logo + HeaderNavButtons
- **Modified**: Settings, Watchlist, About, Film detail, and Letterboxd pages to use SubpageNav
- Map and Reachable pages retain custom headers (they have functional controls like area selectors)

## Why
Previously each subpage had its own back-link implementation. Users on subpages had no way to navigate to other features without going back to the homepage first. SubpageNav gives consistent access to all nav features from any page.
