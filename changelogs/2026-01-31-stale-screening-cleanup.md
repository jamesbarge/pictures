# Critical Fix: Stale Screening Data Cleanup

**Date:** 2026-01-31
**Severity:** CRITICAL
**Impact:** All users viewing cinema listings

## Problem Summary

The scraper pipeline had a "never delete" policy that caused old screenings to accumulate indefinitely. When cinemas changed their schedules, stale data remained in the database, causing the website to show **completely wrong films**.

### Example: Finsbury Park Picturehouse (Feb 1)

| Before (Stale) | After (Correct) |
|----------------|-----------------|
| Raiders of the Lost Ark | Hamnet |
| Duel (4K Remaster) | Marty Supreme |
| Taiwan Short Film Showcase | 28 Years Later: The Bone Temple |
| Iron Lung | Rabbit Trap |

These stale screenings were scraped between **Jan 4-25** but remained in the database even though the cinema's schedule had completely changed.

## Root Cause

The pipeline (`src/scrapers/pipeline.ts`) explicitly stated:
> "IMPORTANT: This function ONLY ADDS or UPDATES screenings. It NEVER DELETES existing screenings."

This was intended to preserve valid screenings but caused stale data to accumulate when:
1. Cinemas changed their schedules
2. Films were removed from programming
3. Showtimes were modified

## Impact Assessment

- **49.9%** of all future screenings (2,917 out of 5,844) were stale
- **38 out of 55** cinemas affected
- **Worst affected:**
  - Prince Charles Cinema: 657 stale
  - Cine Lumiere: 240 stale
  - BFI Southbank: 184 stale
  - Finsbury Park Picturehouse: 96 stale

## Solution

### 1. Emergency Cleanup
- Deleted **2,917 stale screenings** from the database
- Manually restored **28 correct screenings** for Finsbury Park Feb 1

### 2. Pipeline Fix
Created `src/scrapers/utils/stale-screening-cleaner.ts`:
```typescript
// Removes future screenings that weren't updated in current scrape
const { deleted } = await removeStaleScreenings(
  cinemaId, 
  freshScreenings, 
  scrapeStartTime
);
```

Updated `src/scrapers/pipeline.ts`:
- Now reports: `X added, Y updated, Z deleted, W failed`
- Automatically cleans stale data on every scrape

### 3. Long-term Prevention
- Stale screening cleaner runs automatically after each scrape
- Compares source IDs to identify stale data
- Only removes future screenings (preserves past data for analytics)

## Changes Made

**Files Modified:**
- `src/scrapers/pipeline.ts` - Added stale screening cleanup integration
- `src/scrapers/utils/stale-screening-cleaner.ts` - New cleanup utility
- `RECENT_CHANGES.md` - Documentation

## Verification

Finsbury Park Picturehouse (Feb 1):
```
Before: 16 screenings (10 stale, 6 fresh)
After:  28 screenings (all fresh, matches API exactly)
```

Database-wide:
```
Before: 5,844 future screenings (49.9% stale)
After:  3,508 future screenings (0% stale)
```

## Action Items for Production

1. **Run all API-based scrapers** (fast, reliable):
   ```bash
   npm run scrape:picturehouse  # 11 venues
   npm run scrape:curzon        # 10 venues
   npm run scrape:electric      # 2 venues
   npm run scrape:nickel        # 1 venue
   npm run scrape:rich-mix      # 1 venue
   npm run scrape:coldharbour-blue # 1 venue
   ```

2. **Run Cheerio-based scrapers** (Vercel-compatible):
   ```bash
   npm run scrape:rio
   npm run scrape:pcc
   npm run scrape:ica
   npm run scrape:genesis
   npm run scrape:peckhamplex
   npm run scrape:garden
   npm run scrape:castle
   npm run scrape:arthouse
   # ...etc
   ```

3. **Run Playwright-based scrapers** (requires local machine):
   ```bash
   npm run scrape:bfi
   npm run scrape:barbican
   npm run scrape:everyman
   npm run scrape:phoenix
   npm run scrape:lexi
   ```

## Prevention Measures

1. The stale screening cleaner now runs automatically on every scrape
2. Pipeline logs show deletion counts: `X added, Y updated, Z deleted`
3. Future data quality monitoring should alert on:
   - High percentage of stale screenings (>20%)
   - Cinemas with no recent scrapes (>7 days)
   - Dramatic drops in screening counts
