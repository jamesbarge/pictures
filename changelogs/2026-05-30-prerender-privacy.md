# Add prerender = true to the privacy page

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Added `frontend/src/routes/privacy/+page.ts` exporting `export const prerender = true`.
- `/privacy` is now emitted as a static HTML asset at build time (`.svelte-kit/output/prerendered/pages/privacy.html`) instead of being rendered through the dynamic SSR function on every request.

## Impact
- Affects visitors to `/privacy` (static legal copy: headings, paragraphs, a `mailto:` link, scoped styles — no `+page.server.ts`, no client state, no `page.data` reads, no browser-only code).
- Metric moved: TTFB. The page is served as a static edge asset rather than invoking an SSR function on cold misses, which previously also inherited the root layout's per-request `/api/cinemas` fetch (unused by both this page and the Header). The layout server load now runs once at build, snapshotting cinemas.

## Behavior preservation
Rendered DOM is identical — the build's prerendered `privacy.html` contains the same `h1` ("PRIVACY POLICY"), the four `h2` headings (DATA WE COLLECT / ANALYTICS / COOKIES / CONTACT), the `mailto:hello@pictures.london` link, `<title>`/meta description, and the same Header + Footer as the SSR render. Acceptance test: `cd frontend && npx vite build` lists `/privacy` as prerendered and the emitted HTML matches the SSR output element-for-element; Playwright at 390px/1280px asserts the same headings, link, Header and Footer with no console errors.
