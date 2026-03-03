# Fix Playwright Scraper Workflow Timeout

**PR**: #133
**Date**: 2026-03-03

## Changes
- Updated `.github/workflows/scrape-playwright.yml` to increase `scrape-chains` job timeout from `60` to `120` minutes.
- Added per-step timeout guards in `scrape-chains`:
  - Curzon: `40` minutes
  - Picturehouse: `40` minutes
  - Everyman: `20` minutes
- Validated root cause from manual dispatch run `22603158992`:
  - `Scrape Playwright Independents` completed successfully
  - `Scrape Chain Cinemas` was cancelled at exactly the 60-minute job limit while `Scrape Picturehouse` was still executing

## Impact
- Scheduled Sunday Playwright scrape should no longer cancel before chain scrapers finish.
- Keeps bounded failure behavior with explicit per-step timeouts while allowing full-chain completion.
