# Remove all Odeon references from codebase

**Date**: 2026-03-12
**Type**: Cleanup / Dead code removal

## Why

We don't scrape Odeon cinemas and have no plans to. Odeon references were scattered across scrapers, orchestration, UI/SEO text, QA tooling, and seed data — creating false impressions about cinema coverage.

## Changes

### Deleted (3 files)
- `src/scrapers/chains/odeon.ts` — Odeon chain scraper (~400 lines)
- `src/trigger/scrapers/chains/odeon.ts` — Trigger.dev task wrapper
- `src/scrapers/run-odeon.ts` — CLI runner

### Modified (11 files)
- `src/scrapers/chains/index.ts` — Updated example comment
- `src/trigger/task-registry.ts` — Removed `odeon: "scraper-chain-odeon"` from CHAIN_TASK_MAP
- `src/trigger/scrape-all.ts` — Removed `{ id: "scraper-chain-odeon" }` from CHAIN_TASKS
- `src/trigger/qa/utils/booking-checker.ts` — Removed `odeon.co.uk` from stealth list
- `src/app/layout.tsx` — Removed "Odeon" from meta + OG descriptions
- `src/app/page.tsx` — Removed "Odeon" from FAQ answer
- `src/app/about/page.tsx` — Removed "Odeon" from FAQ answer
- `src/app/cinemas/page.tsx` — Removed "Odeon" from meta description
- `src/components/seo/json-ld.tsx` — Removed "Odeon" from Organization + WebSite schemas
- `src/scrapers/festivals/alignment.test.ts` — Removed "odeon" from comment
- `src/db/seed-festivals.ts` — Removed "ODEON Luxe Leicester Square" from FrightFest description

### Not changed (changelogs)
Historical changelogs left as-is — they document what happened at the time.

## Verification
- `npx tsc --noEmit` — passes (errors are from untracked scripts, not this change)
- `npm run lint` — no new warnings
- `npm run test:run` — 791 tests pass (37 test files)
- `grep -ri odeon src/` — zero remaining references
