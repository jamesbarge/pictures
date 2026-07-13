# L-CUT Ingestion, 4 New Venues, Full Scrape + Data-Quality Pass

**PR**: TBD
**Date**: 2026-07-13

## Changes

### L-CUT gap-fill source (`scripts/lcut-gapfill.ts`)
- L-CUT (lcutlondon.com) is a third-party repertory listings guide with a public JSON API
  (`/api/films/date/DD-MM-YYYY?page=N`). New script diffs its listings against our DB and
  inserts only missing screenings, attributed to the REAL venue — never to "L-CUT".
- Dedup: ±20 min window + title match under three normalizations (pipeline `normalizeTitle`,
  gentle no-prefix-strip form, `films.original_title`) + Dice-bigram similarity ≥0.85
  (catches "Colour"/"Color" variants) + self-dedup of L-CUT's own internal variant listings.
- BFI rows dedup against both `bfi-southbank` and `bfi-imax` (L-CUT labels both
  "British Film Institute"). Rows before 09:00 London are skipped as bad upstream data.
- sourceId scheme `lcut-{id}`; inserts go through the standard pipeline (title extraction,
  TMDB matching, upsert). Dry-run default; `--execute` to apply; `--days N` horizon.
- **Run result**: 222 missing screenings inserted across 16 venues. Final parity: 16 of
  ~2,350 L-CUT listings deliberately left out (stale L-CUT near-dupes 21–40 min from an
  existing row of the same film). Close-Up's near-term programme backfilled while its
  scraper is WAF-blocked.

### 4 new venues registered (cinema-registry + seed-cli + DB)
- **The Arzner** (`the-arzner`) — LGBTQ+ cinema & bar, 10 Bermondsey Square SE1 3UN.
  ⚠️ NOT ArtHouse Crouch End (an easy mixup — verified against thearzner.com). 98 upcoming
  screenings ingested. Jacro-style booking system → direct-scraper candidate later.
- **The Horse Hospital** (`horse-hospital`) — Colonnade, Bloomsbury WC1N 1JD.
- **Good Shepherd Studios** (`good-shepherd-studios`) — 15A Davies Lane, Leytonstone E11 3DR.
- **Project Loop** (`project-loop`) — 16 Orsman Road, Haggerston N1 5QJ.

### Full scrape (all 29 scrapers)
- `npm run scrape:unified`: 27/29 succeeded, 0 silent breakers.
- Upcoming screenings **6,428 → 10,506 (+4,078)**; every venue grew.
- Failures (tracked for follow-up): `rich-mix` (Spektrix API returning HTML),
  `close-up-cinema` (WAF 403 on far-future search pages).

### Data-quality pass
- 8-pass `audit:fix-upcoming` dry-reviewed then executed. Manual review blocked **23
  false-positive trigram merges** (now pinned in `NEVER_MERGE_FILM_IDS` in
  `scripts/cleanup-duplicate-films.ts`: Some Like It Hot ≠ Some Like it Swing, Che Part
  One ≠ Part 2, Young Frankenstein ≠ Frankenstein's Bride, World Cup fixtures, etc).
- Dedup merge crash fixed: screenings move now guards `idx_screenings_unique`
  (film+cinema+datetime) — conflicting rows are true duplicates and are deleted; clusters
  are error-isolated. **126 clusters merged, 159 duplicate films removed, ~1,600
  screenings re-pointed, 0 failures.**
- Title-cleaner: `JLG/JLG: …` and `Bookish Series 2: …` colon titles kept intact
  (`film-title-cleaner.ts` keep-list).
- `patrol-autofix --execute`: 18 all-caps titles fixed (+1 manual "U.K." casing fix).
- Data Check v3 patrol cycle run (batch DQS 76 on the hardest-40 cursor batch).
- Global field coverage (films with upcoming screenings, n=1,084): TMDB 74.3%,
  posters 91.1%, synopsis 73.9%, Letterboxd 64.9%, booking URLs 100%. Weighted
  composite ≈ 85. Unmatched tail dominated by legitimate non-films (shorts programmes,
  live events, World Cup).

## Impact
- pictures.london now covers every venue and (verifiably current) screening that L-CUT
  lists — including four venues we'd never covered — sourced from real venue booking links.
- 4,000+ new upcoming screenings from the full scrape; duplicate films purged; dirty
  titles cleaned; false-merge classes permanently blocked.
