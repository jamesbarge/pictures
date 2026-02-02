# Social Outreach Pipeline (Apify → Attio)

**PR**: Direct commit
**Date**: 2026-02-02

## Changes

- Created automated social media discovery pipeline in `scripts/social-outreach/`
- Added Apify integration to scrape 4 platforms:
  - Instagram hashtags (#londoncinema, #bfilondon, etc.)
  - TikTok film-related hashtags and searches
  - YouTube London cinema vlogs/reviews
  - Reddit posts from r/london, r/TrueFilm
- Built Attio CRM client for upserting contacts to People object
- Configured filtering for active, London-based users:
  - Recency filters (7-30 days depending on platform)
  - Engagement thresholds (min likes/views)
  - Location keywords (london, uk, peckham, etc.)
- Added GitHub Actions workflow for weekly automation (Sundays 10am UTC)
- Added npm scripts: `outreach` and `outreach:dry-run`

## Files Added

- `scripts/social-outreach/config.ts` - Search terms and filter configuration
- `scripts/social-outreach/apify-runner.ts` - Apify actor execution
- `scripts/social-outreach/attio-client.ts` - Attio API client
- `scripts/social-outreach/run.ts` - Main CLI entry point
- `scripts/social-outreach/README.md` - Documentation
- `.github/workflows/social-outreach.yml` - Weekly cron workflow

## Files Modified

- `package.json` - Added npm scripts and apify-client dependency

## Impact

- Enables automated discovery of potential Pictures London users/advocates
- Builds CRM database of London film enthusiasts for outreach
- Runs weekly without manual intervention
- Estimated cost: ~$2-3/month on Apify free tier

## Setup Required

1. Add `APIFY_API_TOKEN` to .env.local and GitHub Secrets
2. Add `ATTIO_API_TOKEN` to .env.local and GitHub Secrets
3. Verify Attio workspace has People object with "name" attribute
