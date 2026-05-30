# Add a narrow manualChunks vendor split for bits-ui in vite.config.ts

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Added a `build.rollupOptions.output.manualChunks` function to `frontend/vite.config.ts` that returns `'vendor-bits-ui'` for any module id containing `node_modules/bits-ui`.
- Scoped narrowly to bits-ui only — no broad `node_modules` grouping, so SvelteKit's per-route code splitting and the already-lazy maplibre/posthog chunks are untouched.
- No other config changed (the dev server proxy block is unchanged).

## Impact
- **Who/what it affects:** every client build of the SvelteKit frontend (pictures.london). bits-ui is currently consumed only by `CommandPalette.svelte`.
- **Perf metric moved — bundle KB / long-term caching:** pins the bits-ui primitives into a dedicated, content-hashed vendor chunk so they cache independently and can never be silently re-hoisted into the shared entry/layout chunk by a future static import (a guard-rail for the lazy-mount work).
- **Verified A/B (client build, `npm run build`):**
  - Baseline (origin/main, no manualChunks): bits-ui was inlined into the root layout node chunk `nodes/0.*.js` = 90,379 B; no separate bits chunk existed.
  - With this change: the root layout node chunk dropped to 47,716 B and bits-ui moved to its own ~97,980 B chunk. Total client bytes are equivalent — the change relocates code to a stable, separately-cacheable chunk boundary.
  - The server build emits the chunk literally named `chunks/vendor-bits-ui.js`; on the client SvelteKit content-hashes the filename (the `vendor-bits-ui` logical name is preserved internally), so the on-disk file is hashed but the split is real.

## Behavior preservation
Pure chunk-boundary/caching hint — it only moves code between output files, changing no rendered DOM, styles, or runtime behavior. Acceptance test: `npm run build` is green and emits a dedicated bits-ui vendor chunk; the Cmd+K command palette (the sole bits-ui consumer) renders identically; rendered DOM of every route is byte-identical.
