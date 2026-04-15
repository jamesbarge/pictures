# Fix poster images not loading until hover

**PR**: #424
**Date**: 2026-04-15

## Changes
- Removed `crossorigin="anonymous"` attribute from the `<img>` tag in `FilmCard.svelte`
- This was a regression introduced in #423 (responsive TMDB poster images)

## Root Cause
The `crossorigin="anonymous"` attribute forces the browser to use CORS mode for image requests. Combined with `loading="lazy"` and many concurrent images in a CSS subgrid layout, the browser's IntersectionObserver would stall — images remained in a "pending" state even when clearly in the viewport. A hover event (which mounts the `FittedTitleCanvas` overlay) triggered a DOM mutation and layout recalculation that unstuck the observer.

## Impact
- All poster images on the homepage, calendar, and film grids now load reliably on first render
- No impact on the hover title overlay — `FittedTitleCanvas` loads its own CORS-enabled image independently via `new Image()`
