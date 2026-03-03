# Run All Playwright Scrapers Even If One Fails

**PR**: TBD
**Date**: 2026-03-03

## Changes
- Updated `.github/workflows/scrape-playwright.yml` so scraper steps in both jobs use `continue-on-error: true`.
- Added `id` values to scraper steps and two explicit evaluation steps:
  - `Evaluate chain scraper outcomes`
  - `Evaluate independent scraper outcomes`
- The evaluation steps now fail the job if any scraper step outcome is `failure`, after all eligible scrapers have run.

## Impact
- A single scraper error no longer prevents later scrapers in the same job from running.
- Workflow still returns a failing status when any scraper fails, so notifications and visibility are preserved.
- Addresses the observed behavior in run `22605177172`, where Curzon failure caused Picturehouse and Everyman to be skipped.
