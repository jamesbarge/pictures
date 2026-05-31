# Add a 2000ms timeout to the requestIdleCallback deferring PostHog/web-vitals boot

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/analytics/PostHogProvider.svelte`, pass `{ timeout: 2000 }` as the second argument to the `requestIdleCallback(loadPostHog)` call that defers analytics boot.
- This caps the idle deferral at 2000ms so the browser forces the callback even when the main thread never goes idle, matching the existing `setTimeout(loadPostHog, 2000)` fallback ceiling used when `requestIdleCallback` is unavailable.
- No other code changed; the idle-first behavior on a quiet thread is identical to before.

## Impact
- Affects analytics-boot reliability for every page that mounts `PostHogProvider` (the root layout).
- Metric moved: analytics-boot reliability / worst-case latency. Guarantees `initPostHog`, the initial `trackPageview`, and `startWebVitals` run within <=2s, preventing silently-dropped pageview and Core Web Vitals captures on thread-starved sessions (long hydration, continuous scroll/animation, slow devices) — exactly the slow sessions where the data matters most. Fast-path (quiet-thread) timing is unchanged.

## Behavior preservation
On a quiet main thread the callback still fires during idle exactly as before — only the worst-case ceiling changes; rendered DOM is unchanged. Acceptance: on a quiet thread posthog-js still loads after first paint during idle (same timing); under a main-thread busy-loop on load, posthog-js + web-vitals chunks now appear in Network within ~2s; the initial pageview still POSTs to /ingest in both cases; `npx playwright test` passes.
