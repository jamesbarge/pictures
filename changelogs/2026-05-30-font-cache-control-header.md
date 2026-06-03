# add bounded Cache-Control header for self-hosted /fonts/*.woff2 (30-day, not immutable)

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Added a top-level `headers` array to `frontend/vercel.json` (sibling to the existing `rewrites`).
- Single entry matching `/fonts/(.*)` sets `Cache-Control: public, max-age=2592000, stale-while-revalidate=86400`.
- 30-day TTL with 1-day stale-while-revalidate. Deliberately NOT `immutable` and NOT a year-long max-age, so a same-name font swap still propagates within 30 days.
- Existing `/api/*` and `/ingest/*` rewrites left untouched (proxy intact).

## Impact
- Affects all returning visitors of pictures.london loading the self-hosted woff2 fonts in `frontend/static/fonts/` (Fraunces, IBMPlexMono, InterVariable, Cormorant-Italic — three of which are render-blocking preloaded per `app.html`).
- Metric moved: eliminates the per-font conditional `304` revalidation round-trip on every repeat visit (fonts were previously served `cache-control: public, max-age=0, must-revalidate`). Removes a round-trip on the critical render path for returning visitors.

## Behavior preservation
- Caching-only header change; no rendered DOM, layout, computed style, or user-facing behavior changes. Acceptance: `curl -sD- -o/dev/null https://www.pictures.london/fonts/Fraunces.woff2` shows `cache-control: public, max-age=2592000, ...` (not `max-age=0`), and the `/api/*` + `/ingest/*` rewrites still proxy correctly.
