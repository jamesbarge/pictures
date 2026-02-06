# Admin BFI Import Endpoint

**PR**: #74
**Date**: 2026-02-04

## Changes
- Added new admin API endpoint at `/api/admin/bfi-import`
- Supports two import modes:
  - Full import (POST without params): Parses the BFI monthly guide PDF and programme changes page
  - Changes only (POST with `?changesOnly=true`): Only checks the programme changes page (faster)
- GET endpoint returns usage documentation and scheduled job info
- All endpoints require Clerk authentication
- Returns detailed results including screening counts, save stats, and duration

## Usage

```bash
# Full import (parses monthly PDF + changes)
curl -X POST https://pictures.london/api/admin/bfi-import

# Changes only (faster, for daily updates)
curl -X POST https://pictures.london/api/admin/bfi-import?changesOnly=true

# Check endpoint info
curl https://pictures.london/api/admin/bfi-import
```

## Impact
- Enables manual BFI data imports without waiting for scheduled Inngest jobs
- Useful for immediately refreshing BFI listings when needed
- Complements existing scheduled imports:
  - Full PDF import: Sundays 6:00 AM UTC (Inngest)
  - Programme changes: Daily 10:00 AM UTC (Inngest)
