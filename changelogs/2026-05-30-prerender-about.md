# Add prerender = true to the about page

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Created `frontend/src/routes/about/+page.ts` exporting `export const prerender = true;`
- SvelteKit + adapter-vercel now emit `/about` as static HTML at build time instead of rendering it through the SSR/ISR pipeline on every request.
- The root `+layout.server.ts` load still runs once during the prerender crawl (snapshotting the cinema list into the Header prop the Header no longer reads), but the rendered DOM is unchanged.
- The root layout's prerender setting is left untouched so all other routes remain ISR.

## Impact
- Affects the `/about` route only.
- Metric moved: **TTFB** — eliminates the per-request SSR function invocation and the upstream `/api/cinemas` round-trip on cold ISR misses. `/about` is now served as a static edge asset whose output never varies per request.
- `/about` is pure static prose (h1, paragraphs, mailto link, scoped style) with no `+page.server.ts`, no `page.data` reads, no client/browser-only code, so it is safe to prerender.

## Behavior preservation
Rendered output is byte-identical: the prerendered `.svelte-kit/output/prerendered/pages/about.html` contains the same `ABOUT` h1, body copy, and `mailto:hello@pictures.london` link as the dynamic render. Acceptance: `npm run build` lists `/about` as a prerendered route (verified: `about.html` emitted) and the prerendered HTML matches the production DOM (h1, paragraphs, mailto link, head title/meta).
