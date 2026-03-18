# Remove Romford Lumiere Cinema

**PR**: #TBD
**Date**: 2026-03-18

## Changes
- Deleted `src/scrapers/cinemas/romford-lumiere.ts` (Playwright scraper)
- Deleted `src/scrapers/run-romford-lumiere-v2.ts` (manual run script)
- Deleted `src/trigger/scrapers/independent/romford-lumiere.ts` (Trigger.dev task)
- Deleted 4 sole-purpose changelogs
- Removed cinema entry from `src/config/cinema-registry.ts`
- Removed factory block from `src/inngest/functions.ts`
- Removed ID from `src/inngest/known-ids.ts`
- Removed commented-out task from `src/trigger/scrape-all.ts`
- Removed mapping from `src/trigger/task-registry.ts`
- Removed seed data from `src/db/seed-cli.ts`
- Removed `scrape:romford-lumiere` npm script and reference in `scrape:independents`

## Why
Romford Lumiere's website is powered by CineSync, which returns HTTP 403 on all API endpoints. The browser view shows "No movies available". Investigation confirmed this is an upstream CineSync platform issue with no workaround on our side.

## Impact
- One fewer cinema in the calendar (was already returning zero screenings)
- No user-facing regression — the cinema had no active listings

## Database Cleanup (manual)
Run against production database:
```sql
DELETE FROM screenings WHERE cinema_id = (SELECT id FROM cinemas WHERE slug = 'romford-lumiere');
DELETE FROM cinemas WHERE slug = 'romford-lumiere';
```
