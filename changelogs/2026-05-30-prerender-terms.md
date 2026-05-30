# Add prerender = true to the terms page

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Created `frontend/src/routes/terms/+page.ts` exporting `const prerender = true`.
- `/terms` is now emitted as static HTML at build time by SvelteKit + adapter-vercel (verified: `.vercel/output/static/terms.html` and `.svelte-kit/output/prerendered/pages/terms.html`).

## Impact
- Who/what: every visitor to `/terms` (static legal copy: headings, paragraphs, mailto link, scoped styles — no data load, no client state).
- Metric moved: TTFB. The page is now served as a static edge asset instead of going through the SSR/ISR render path, which eliminates the cold-start SSR function invocation plus the root layout's inherited per-request `/api/cinemas` round-trip (the Header no longer consumes that prop) on cold misses.

## Behavior preservation
- Rendered output is identical: `/terms` renders no per-request data, so prerendering at build snapshots the exact same DOM (h1 "TERMS OF SERVICE", the h2 headings USE OF SERVICE / BOOKING / ACCURACY / CONTACT, mailto link, head title/meta, Header + Footer). Acceptance test: `npm run build` lists `/terms` as prerendered and a byte-diff of the prerendered HTML against the current production `/terms` body + head is identical.
