# Frontend unit tests run in CI

**PR**: #770
**Date**: 2026-10-03

## Changes
- The `Frontend E2E (pictures.london)` job in `.github/workflows/test.yml` now runs `npm test` (vitest) straight after `npm ci`, before the browser install.
- Playwright only matches `*.spec.ts`, and the root job's vitest only covers the root `src/`. The 10 test files under `frontend/src/**/*.test.ts` (92 tests on main, including `london-date.test.ts` and the search parsers) had never run in CI.
- `npm ci` runs `svelte-kit sync` through the frontend `prepare` script, which generates the tsconfig vitest needs, so the step needs no extra setup.

## Impact
- A broken frontend unit test fails the job in seconds, before the build and E2E steps.
- Checked locally under `TZ=UTC`, as on the runner: 92 of 92 pass on main.
