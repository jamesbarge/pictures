# Kaizen — Extend checkHealth with Options, Convert Final 4 Scrapers

**PR**: #184
**Date**: 2026-03-12

## Changes
- Added optional `fetchOptions` parameter to `checkHealth()` in `src/scrapers/utils/health-check.ts`
- Converted 4 scrapers (david-lean, regent-street, rich-mix, the-nickel) from manual healthCheck to `checkHealth(url, options)`
- david-lean/regent-street/rich-mix pass `{ headers: { "User-Agent": BOT_USER_AGENT } }`
- the-nickel passes `{ signal: AbortSignal.timeout(10_000) }`

## Impact
- Code quality improvement, no behavior changes
- Completes the healthCheck deduplication started in PRs #181 and #183
- Only 2 scrapers retain manual healthCheck (bfi, phoenix) — these use Playwright, not fetch
- Kaizen category: duplicate-pattern
