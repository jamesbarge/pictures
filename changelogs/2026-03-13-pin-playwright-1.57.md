# Pin Playwright to ~1.57.0 for Trigger.dev Compatibility

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Pinned `@playwright/test` and `playwright` from `^1.57.0` to `~1.57.0` (allows 1.57.x patches only)
- Playwright 1.58+ changed the `npx playwright install --dry-run` output format from `browser: chromium-headless-shell` to `Chrome Headless Shell ... (playwright chromium-headless-shell vNNNN)`
- The `@trigger.dev/build@4.4.3` Playwright extension greps for the old format, causing Docker builds to fail with exit code 1
- Tracked upstream: https://github.com/triggerdotdev/trigger.dev/issues/3089

## Impact
- Fixes `deploy-trigger.yml` GitHub Actions workflow which has been failing at the Trigger.dev container build step
- Allows Trigger.dev task deployments (scraper scheduling) to succeed again
- No functional impact — Playwright 1.57.0 vs 1.58.2 difference is minimal for cinema scraping
- Temporary: remove pin when `@trigger.dev/build` ships a fix for issue #3089
