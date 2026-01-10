---
phase: 01-diagnose-broken-scrapers
plan: 01
type: summary
---

# Summary: Scraper Diagnosis and Fixes

## What Was Done

Diagnosed why 4 cinemas had no screening data and fixed the issues.

### Root Cause Found

**Database schema mismatch** - The `manually_edited` and `edited_at` columns existed in the Drizzle schema but not in the production database. This caused ALL scrapers to fail when trying to insert/query screenings.

### Fixes Applied

1. **Database Schema** - Added missing columns via SQL:
   ```sql
   ALTER TABLE screenings ADD COLUMN manually_edited BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE screenings ADD COLUMN edited_at TIMESTAMP WITH TIME ZONE;
   ```

2. **Lexi Scraper** - Fixed JSON extraction regex:
   - Old: Non-greedy regex that stopped at wrong semicolon
   - New: Bracket-matching approach that correctly finds the complete JSON object

3. **Genesis Scraper** - Fixed date extraction:
   - Old: Looking for text-based dates ("13 January")
   - New: Extracts dates from panel IDs (`panel_20260113` → "13 Jan 2026")

### Scraper Results

| Cinema | Status | Screenings | Date Range |
|--------|--------|------------|------------|
| Genesis | ✅ Fixed | 104 | Until Feb 27 |
| Lexi | ✅ Fixed | 103 | Until Mar 11 |
| Phoenix | ✅ Working | 25 | Until Jan 17 |
| Castle Sidcup | ✅ Working | 66 | Until Jan 15 |

### High-Priority Scrapers Run

| Scraper | Screenings | Venues |
|---------|------------|--------|
| Curzon | 990 | 10 |
| Everyman | 1048 | 14 |
| Picturehouse | 1668 | 11 |
| BFI | 424 | 2 |
| Barbican | 41 | 1 |
| Electric | 60 | 1 |

### Database State After

- **Total future screenings**: 5,981 (up from 2,872)
- **Date coverage**: Through April 6, 2026
- **Previously broken cinemas**: All now have data

### Files Modified

| File | Change |
|------|--------|
| `src/scrapers/cinemas/genesis.ts` | Fixed date extraction from panel IDs |
| `src/scrapers/cinemas/lexi.ts` | Fixed JSON extraction with bracket matching |
| Database | Added manually_edited and edited_at columns |

### Commits

- `ef7ac01` - fix: repair Genesis and Lexi scrapers
- `36258c3` - docs: initialize scraper fix project

## Notes

- Phoenix and Castle Sidcup scrapers were working correctly; they just couldn't save data due to schema mismatch
- Curzon venues only publish data ~2 weeks ahead, so their Jan 23-27 end dates are expected
- Some cinemas (Phoenix, Castle Sidcup) have limited future data available on their websites
