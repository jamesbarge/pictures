# Allow Additional Poster Domains

**PR**: #56
**Date**: 2026-02-01

## Changes
- Added Next.js image allowlist entries for non-TMDB poster sources.
- Enabled calendar view to load external poster URLs already stored in film records.

## Impact
- Calendar posters now render for films using external sources like BFI, CloudFront, or Ticketlab.
- Reduces placeholder usage for valid non-TMDB images.
