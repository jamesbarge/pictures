# Kaizen — Lint-fix Agents, PostHog API, Eventive, Scripts

**PR**: #245
**Date**: 2026-03-13

## Changes
- `src/scrapers/festivals/eventive-scraper.ts` — removed unused `_slugBase` parameter from `createScreening()` and its 2 call sites
- `src/lib/posthog-api.ts` — replaced 2 unused `const projectId = getProjectId()` with `void getProjectId()` (preserves env var validation)
- `src/agents/data-quality/index.ts` — removed dead `runVisualVerification()` function (TODO stub, never called)
- `src/agents/scraper-health/index.ts` — removed unused `config` assignment in `runHealthCheckAllCinemas()`
- `src/scripts/reprocess-suspicious-matches.ts` — removed unused `or` import from drizzle-orm

## Impact
- Code quality improvement, no behavior changes
- Lint warnings reduced from 71 to 64
- Final PR of the nightly kaizen session (20/20 cap)
- Kaizen category: lint-fix
