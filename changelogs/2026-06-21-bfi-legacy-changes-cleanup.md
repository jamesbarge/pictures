# BFI times fix — purge legacy `bfi-changes-` cluster rows

**PR**: #723
**Date**: 2026-06-21
**Type**: Production data fix (no runtime code change — the code bug was already fixed in #640)

## Symptom
A user reported "BFI times are wrong" on pictures.london. BFI Southbank screenings showed:
- **+1h shifts** vs the cinema's own site (e.g. Strictly Ballroom shown 21:40, actually 20:40).
- **Duplicate cluster times**: ~10–12 different films all stamped at the same handful of times (15:45 / 18:45 / 19:00 / 19:05 / 19:20 / 21:45 / 21:50) — impossible in a 4-screen venue.

## Investigation (systematic-debugging)
1. Reproduced against live data + ground truth: pulled BFI's authoritative listing from `whatson.bfi.org.uk` and compared to the DB / pictures.london. Some films matched, most were +1h or duplicated.
2. The *mix* (same cinema/day, some rows correct, some wrong) ruled out a uniform code bug → pointed at a **data** problem.
3. DB query by sourceId scheme exposed two ingest paths coexisting:
   - **Playwright** (`bfi-bfi-<cinema>-…`) — correct times, last good scrape stale (06-12).
   - **Programme-changes fallback** (`bfi-changes-<slug>-<iso>`) — written through 06-21, carrying the **cluster bug**: every film in a shared `<p>` inherited every sibling's showtimes.

## Root cause
- The cluster bug + the legacy `bfi-changes-` sourceId scheme were **already fixed in #640 (dc5cf639, 2026-06-01)**: the changes path now uses `buildBfiSourceId()` (`bfi-<cinema>-…`) and `getFollowingText` is bounded by the next bold title. **Current code cannot emit `bfi-changes-` sourceIds.**
- Yet `bfi-changes-` rows had `scraped_at` of 06-21 — proving the **scrape orchestrator ran a pre-#640 checkout** (it runs separately from Vercel; a stale local checkout or a long-running scheduler started before 06-01).
- These legacy rows were **orphaned**: the screening upsert keys on `(cinema_id, source_id)`, and the pipeline's `cleanup-superseded` step only prunes *within* a sourceId scheme. So a fresh (correct) Playwright scrape wrote new `bfi-bfi-` rows **alongside** the bad `bfi-changes-` rows instead of replacing them.

## Fix
1. Re-ran `npm run scrape:bfi` from current `main` (#640) on a local machine. Playwright path passed cold: **317 BFI Southbank + 133 BFI IMAX** valid screenings written with correct, non-clustered times (IMAX validator correctly rejected 25 early-hour "The Odyssey" rows).
2. Deleted the orphaned legacy rows (psql; `tsx` wedges locally):
   ```sql
   DELETE FROM screenings
   WHERE cinema_id IN ('bfi-southbank','bfi-imax')
     AND source_id LIKE 'bfi-changes-%';
   ```
   Removed **1,054 rows** (143 future + 911 past). Verified pre-delete that all 143 future rows were cluster-bug fabrications (139) or duplicates of correct Playwright rows (4) — **zero genuine screenings lost**.

## Verification
- **DB**: BFI now 100% Playwright-sourced (317 + 133 future); 0 timeslots with ≥3 films.
- **Prod API** (`api.pictures.london/api/screenings`, cache-busted): 0 clusters; today's times match bfi.org.uk exactly (Boogie Nights 17:45, Tell Me When I Die 18:15, The Protagonist and His Pathetic Fallacy 18:30).
- **Homepage**: Vercel ISR (`expiration: 3600`) had a stale snapshot frozen between the scrape and the delete; it self-heals within ~1h. No deploy required.

## Impact
- BFI Southbank / IMAX showtimes on pictures.london are correct again.
- Documented the recurring failure mode + cleanup runbook in `src/scrapers/SCRAPING_PLAYBOOK.md`.

## Recommended follow-up (not in this change)
- **Recurrence prevention** is operational: ensure whatever runs the scheduled BFI scrape is on `main` ≥ `dc5cf639`. A long-running scheduler started before 06-01 must be **restarted** to pick up #640.
- **Optional code hardening**: after a *successful* Playwright BFI scrape, have the pipeline delete same-venue future rows whose `source_id` doesn't match the current `bfi-<cinema>-` scheme, so a stray stale-code run self-heals on the next good scrape. Touches `pipeline.ts` persistence — needs tests + review; deferred to keep this fix minimal.
