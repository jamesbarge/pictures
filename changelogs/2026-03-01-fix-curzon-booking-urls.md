# Fix Curzon Booking URLs

**Date**: 2026-03-01
**Branch**: `fix/curzon-booking-urls`
**Files**: `src/scrapers/chains/curzon.ts`

## Problem

Curzon changed their website's frontend routing. Booking URLs that used path-based
segments (`/ticketing/seats/MAY1-32556/`) now return 404. The new format uses a
query parameter: `/ticketing/seats/?sessionId=MAY1-32556`.

The QA audit on 2026-03-01 flagged 184 broken Curzon booking links (all returning
HTTP 404), making Curzon the single largest source of broken links on pictures.london.

## Root Cause

The Curzon scraper built booking URLs using the Vista API `showtime.id` as a path
segment. Curzon's SPA now expects this ID as a `sessionId` query parameter instead.

## Fix

- **Scraper** (`curzon.ts:453`): Changed the URL template from
  `` `${baseUrl}/ticketing/seats/${showtime.id}/` `` to
  `` `${baseUrl}/ticketing/seats/?sessionId=${showtime.id}` ``

- **Database**: Ran a one-time migration updating 216 existing booking URLs from
  the old format to the new format using `REPLACE()`.

## Verification

- Tested multiple showtime IDs with both old and new URL formats
- Old format: all return HTTP 404
- New format: all return HTTP 200
