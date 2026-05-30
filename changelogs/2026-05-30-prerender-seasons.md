# Add prerender = true to the seasons placeholder page

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Added `frontend/src/routes/seasons/+page.ts` exporting `const prerender = true;`.
- `/seasons` is now emitted as a static HTML asset at build time (adapter-vercel) instead of being served by a per-request serverless function.

## Impact
- Affects the `/seasons` route only. It is a fixed "coming soon" placeholder (static `<h1>SEASONS</h1>` plus an `EmptyState`) with no `+page.server.ts`, no `page.data` reads, and no client/browser-only state, so its output cannot vary per request.
- Perf metric moved: **TTFB**. Eliminates the SSR cold-start invocation and the root layout's per-request `/api/cinemas` upstream fetch on cold misses; the page is now served as a static edge asset.
- Verified in the build: `prerendered_routes` now contains `/seasons`, `.vercel/output/static/seasons.html` is produced, the `seasons.func` serverless function is gone, and the Vercel config adds an override mapping `seasons.html -> path: seasons`.
- The root layout `load` still runs once during prerender (snapshotting the unused cinema list into the Header prop), so the rendered DOM is unchanged. Guardrail: if the page ever gains real per-request data it will fail the prerender build, signalling the export should be removed.

## Behavior preservation
Rendered DOM, head metadata, and layout are byte-identical (prerendered `seasons.html` contains the same `<title>Seasons — pictures · london</title>`, `SEASONS` heading, EmptyState title "Seasons coming soon", description, and `role="status"`). Acceptance: `cd frontend && npm run build` lists `/seasons` as prerendered and emits `seasons.html`; byte-diffing `curl -s https://pictures.london/seasons` main content vs the prerendered output is identical; Playwright at 390px/1280px asserts the `SEASONS` h1 and "Seasons coming soon" EmptyState text, with Header + Footer rendered and no console errors.
