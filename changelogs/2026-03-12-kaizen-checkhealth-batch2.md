# Kaizen — Adopt checkHealth in 4 More Scrapers

**PR**: #183
**Date**: 2026-03-12

## Changes
- Replaced 4 identical `healthCheck()` implementations with the shared `checkHealth()` utility from `src/scrapers/utils/health-check.ts`
- Scrapers converted: coldharbour-blue, electric, peckhamplex, castle-sidcup
- Each had the same pattern: `fetch(url, { method: "HEAD" }) → response.ok` with try/catch returning false

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: duplicate-pattern
