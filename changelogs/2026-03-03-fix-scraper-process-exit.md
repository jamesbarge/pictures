# Fix Weekly Cinema Scrape Timeout

**Date**: 2026-03-03
**Branch**: `fix/scraper-process-exit`
**Files**: `src/scrapers/runner-factory.ts`

## Problem

The Weekly Cinema Scrape GitHub Action had been failing (cancelled) for 8 consecutive weeks since January 11, 2026. The last successful run was January 4.

Every scraper process completed its work (printing "Complete: X added, Y updated") but never exited. The postgres.js connection pool created in `src/db/index.ts` kept the Node.js event loop alive indefinitely.

Since each step had `continue-on-error: true`, the workflow kept advancing through all scrapers, but every step burned its full timeout (5-20 minutes) waiting for a process that would never terminate. The cumulative step timeouts (~135 minutes) exceeded the job's 120-minute limit, killing the entire workflow before later scrapers could run.

## Root Cause

In `createMain()` (`runner-factory.ts`), the failure path called `process.exit(1)` but the success path simply returned — leaving the process hanging with an open database connection.

## Fix

Added `process.exit(0)` to the success path, mirroring the existing failure behavior. This single line affects all 27 scrapers that use the shared `createMain()` factory.

## Impact

- All 27 cinema scrapers now exit cleanly after completing
- Weekly scrape should complete well within the 120-minute limit (actual work takes ~30-40 minutes)
- No behavioral changes to scraping logic
