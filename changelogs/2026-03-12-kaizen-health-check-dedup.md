# Kaizen — Extract shared checkHealth utility for scrapers

**PR**: #181
**Date**: 2026-03-12

## Changes
- `src/scrapers/utils/health-check.ts` (NEW): Shared `checkHealth(url)` — HEAD request returning boolean
- `src/scrapers/cinemas/castle.ts`: Replaced 7-line healthCheck with `checkHealth(this.config.baseUrl)`
- `src/scrapers/cinemas/lexi.ts`: Replaced 7-line healthCheck with `checkHealth(this.config.baseUrl)`
- `src/scrapers/cinemas/genesis.ts`: Replaced 8-line healthCheck with `checkHealth(this.config.baseUrl)`

## Impact
- Deduplicates identical health check logic across 3 scrapers (11 more scrapers could adopt later)
- Code quality improvement, no behavior changes
- Kaizen category: duplicate-pattern
