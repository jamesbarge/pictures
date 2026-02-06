# Scraper Infrastructure Consolidation

**PR**: #73
**Date**: 2026-02-04

## Summary

Major infrastructure overhaul to address cinema ID fragmentation and add automated health monitoring for scrapers.

## Changes

### Canonical Cinema Registry
- Created `src/config/cinema-registry.ts` with 63 cinema definitions
- Single source of truth for all cinema data (ID, name, chain, scraper type, etc.)
- Functions to replace hardcoded lists: `getActiveCinemas()`, `getCheeriocinemas()`, `getPlaywrightCinemas()`, `getCinemaToScraperMap()`
- Legacy ID resolution via `getCanonicalId()` for migration compatibility
- Picturehouse venue IDs updated to match chain scraper expectations

### Health Monitoring System
- New `src/lib/scraper-health/` service with freshness/volume scoring
- Database table `health_snapshots` to track metrics over time
- Slack webhook integration for critical/warning alerts
- Health check cron at `/api/cron/health-check` runs 7am UTC daily
- Admin API at `/api/admin/health` for dashboard visibility
- Only checks active cinemas from registry (avoids noisy alerts)

### V2 Chain Runners
- `run-curzon-v2.ts`, `run-picturehouse-v2.ts`, `run-everyman-v2.ts`
- Use runner-factory pattern with proper TypeScript types
- Derive venues from canonical registry
- Consistent logging and retry-then-continue error handling

### Admin Scrape API
- Updated to use registry for validation
- Maintains backwards compatibility with Inngest (sends original IDs)

### Database Migration
- `src/db/migrations/canonicalize-cinema-ids.ts`
- Run: `npm run db:migrate-cinema-ids` (dry-run) or `--apply`
- Migrates screenings from legacy IDs to canonical IDs

## Impact

- **Scrapers**: No immediate changes required; v2 runners available
- **Database**: Run migration script to consolidate cinema IDs
- **Monitoring**: Automatic alerts for stale or empty scrapers
- **Admin**: Health dashboard visibility for scraper status

## Configuration

New environment variables (optional):
- `SLACK_WEBHOOK_URL` - Enable Slack alerts for health issues

New scripts:
- `npm run db:migrate-cinema-ids` - Run ID migration (dry-run by default)
- `npm run scrape:curzon-v2` - Use new Curzon runner
- `npm run scrape:picturehouse-v2` - Use new Picturehouse runner
- `npm run scrape:everyman-v2` - Use new Everyman runner
