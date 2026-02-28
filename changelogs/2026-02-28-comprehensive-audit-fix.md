# Comprehensive Audit Fix — 897 Issues

**PRs**: #120, #121, #122
**Date**: 2026-02-28

## Changes

### Code Fixes (merged to main)
- **Film card count mismatch (PR #120)**: `filmTotals` memo now uses `parsedScreenings` (unfiltered) instead of `filteredScreenings`, so card counts always match detail page totals regardless of active filters
- **Non-film content filter (PR #121)**: Added `contentType = 'film' OR contentType IS NULL` filter to both server-side initial load (`page.tsx`) and API repository (`screening.ts`), excluding quizzes, ballet, NT Live, etc.
- **Audit checker improvements (PR #122)**: Bot-protected domain whitelist (BFI, Veezi, Genesis) eliminates ~171 false-positive criticals; updated domain maps for Cine Lumiere, The Nickel, ArtHouse, Olympic, Castle eliminates ~42 false-positive warnings

### Database Operations
- Reclassified 4 non-film items as `live_broadcast` or `event` (NT Live: Hamlet, NT Live: All My Sons, Royal Ballet: Giselle, Celebrating Peaky Blinders)
- Merged 8 duplicate film records with screening migration and collision handling
- Enriched 725 films with TMDB matching via `db:enrich`, 59 via `enrich:upcoming`, 20 poster URLs
- Fixed 4 film titles: removed quotes from "Wuthering Heights", fixed "All You Need Is Kill" casing, cleaned "Toddler Club:" prefix, cleaned "IMAX exclusive preview week" prefix
- Re-scraped Everyman (14 venues), Picturehouse (11 venues), Rich Mix, Lexi, and other independents

### Scripts Created
- `scripts/fix-non-film-content.ts` — targeted contentType reclassification
- `scripts/fix-contaminated-booking-urls.ts` — cleanup curzon.com URLs at non-Curzon cinemas
- `scripts/fix-contaminated-booking-urls-v2.ts` — v2 using cinema ID (slug) instead of slug column
- `scripts/merge-duplicate-films.ts` — merge films with same title, different IDs
- `scripts/fix-title-mismatches.ts` — fix audit-detected title mismatches and unclean titles

## Re-Audit Results

### First pass (mid-session)
- Baseline: 897 issues (655 critical, 196 warning, 46 info)
- After fix: **672 issues** (452 critical, 161 warning, 59 info) — **25% reduction**

### Final pass (after all scraper re-runs)
- **624 issues** (422 critical, 137 warning, 65 info) — **30% reduction from baseline**

### Breakdown by category
| Category | Baseline | Final | Change |
|---|---|---|---|
| broken_booking_link | 373 | 186 | **-50%** |
| missing_poster | 268 | 235 | **-12%** |
| duplicate_film_card | 112 | 94 | **-16%** |
| suspicious_screening | 46 | 65 | +41% (more data from re-scrapes) |
| booking_domain_mismatch | 42 | 8 | **-81%** |
| missing_tmdb_data | 41 | 33 | **-20%** |
| non_film_content | 11 | 0 | **-100%** |
| no_screenings | 3 | 1 | **-67%** |
| card_detail_mismatch | 0 | 0 | **fixed** |
| title_not_clean | 1 | 1 | 0 |
| screening_gap | 0 | 1 | new |

### Scraper re-run results
- **Everyman v2**: 14 venues, 1,137 screenings (44 added, 1,016 updated)
- **Picturehouse v2**: 11 venues, 2,167 screenings (407 added, 1,649 updated)
- **Rich Mix**: 77 screenings updated
- **Lexi**: 116 screenings updated

## Known Remaining Issues
- **~150 Curzon broken booking links**: Curzon scraper cannot capture auth token (Cloudflare bot protection). Needs dedicated scraper fix or alternative booking URL source.
- **235 missing posters**: Mostly niche/non-English titles without TMDB entries. Would benefit from manual poster URL collection or alternative poster sources.
- **94 duplicate film cards**: Mostly legitimate (same film, multiple daily screenings). Audit checker may need refinement to distinguish real duplicates from multiple showings.
- **Invalid Anthropic API key**: `ANTHROPIC_API_KEY` in .env.local returns 401 — title extraction and content classification fall back to regex/similarity matching.
