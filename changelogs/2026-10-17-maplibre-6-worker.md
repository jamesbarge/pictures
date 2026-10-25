# maplibre-gl 6.12 with a bundled tile worker

**PR**: #813
**Date**: 2026-10-17

## Changes
- Dependabot bump of maplibre-gl from 5.24.0 to 6.12.0 in `frontend/`. This clears the open critical Dependabot alert (MapLibre GL JS XSS sanitizer bypass in `DOM.sanitize()`, fixed in 6.4.1).
- maplibre-gl 6 ships its tile worker as a separate ES module (`dist/maplibre-gl-worker.mjs`, which imports `maplibre-gl-shared.mjs`) and locates it with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Once Vite bundles maplibre into an app chunk, that URL points at a file the build never emits: the request 404s, the console logs "Worker failed to load" and no tiles render.
- `frontend/src/lib/components/map/CinemaMap.svelte` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`, which makes Vite bundle the worker with its shared module into `_app/immutable/workers/`, and passes that URL to `maplibregl.setWorkerUrl()` before creating the map.

## Verification
- Production build with Node 22 + `vite preview`, Playwright on `/map` at 1440x900 and iPhone 12 Pro: before the fix, 65 markers and popups but no tiles and a worker load error; after, tiles render, 65 markers, a marker click opens its popup, and no worker errors. `svelte-check` 0 errors.

## Impact
- pictures.london `/map`. Without the fix, merging the bump alone would have shipped a map with pins on an empty background.
