# Comprehensive Film Data Quality Fixes

**Date**: 2026-01-31

## Overview
Massive data quality improvement fixing film titles, posters, duplicates, and classifications. Addressed the user's concern about films like "ANZ FILM FESTIVAL: WE BURY THE DEAD" not displaying correctly.

## Problem Statement
Frontend was showing:
- Films with festival/event prefixes: "ANZ FILM FESTIVAL: WE BURY THE DEAD"
- Missing images for valid films
- Duplicate film records
- Misclassified live broadcasts
- Non-film content mixed with films

## Statistics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total films | 1091 | 1074 | -17 duplicates reclassified |
| Missing posters | 254 (23.3%) | 213 (19.8%) | **-41 posters** |
| Without TMDB ID | 569 (52.2%) | 520 (48.4%) | **-49 matches** |
| Problematic titles | 35 | 8 | **-27 cleaned** |
| Misclassified live broadcasts | 10 | 0 | **-10 fixed** |

## Files Created

### 1. src/scripts/analyze-film-data-quality.ts
Comprehensive diagnostic tool for ongoing monitoring:
- Identifies films missing posters, TMDB IDs, years
- Detects problematic titles needing cleaning
- Finds misclassified live broadcasts
- Reports potential duplicates

### 2. src/scripts/fix-festival-films.ts
Dedicated script for cleaning festival film titles:
- Strips festival prefixes (ANZ, LSFF, Iris, etc.)
- Attempts TMDB matching with cleaned titles
- Merges duplicates when TMDB IDs match

### 3. src/scripts/fix-remaining-issues.ts
Handles live broadcasts and event series:
- Reclassifies live broadcasts with contentType
- Cleans event series titles (Drink & Dine, Liberated Film Club, etc.)
- Merges films into existing records

### 4. src/scripts/fix-final-issues.ts
Final cleanup for edge cases:
- Handles double bills
- Verifies Met Opera classifications
- Processes remaining NT Live titles

### 5. src/scripts/classify-non-films.ts
Identifies non-film content:
- Workshops, clubs, quizzes
- Talks, discussions, Q&As
- Season programming
- Short film collections

## Files Modified

### src/lib/title-patterns.ts
Added festival patterns:
```typescript
"ANZ Film Festival",
"ANZ FILM FESTIVAL",
"Iris LGBTQ+ Film Festival",
"Iris LGBTQ+ Film Festival On the Move",
"London Short Film Festival",
"London Short Film Festival Showcase",
```

Plus regex patterns for detection.

### src/agents/enrichment/title-extractor.ts
Same festival patterns added for agent processing.

### src/db/backfill-posters.ts
Same festival patterns added for backfill processing.

## Detailed Fixes

### Festival Films Fixed (18 films)

**ANZ Film Festival (6 films):**
- `ANZ Film Festival: Kangaroo` → `Kangaroo` ✓ TMDB matched ✓ Poster added
- `ANZ FILM FESTIVAL: HEAD SOUTH` → `Head South` (linked to existing)
- `ANZ FILM FESTIVAL: PIKE RIVER` → `Pike River` (linked to existing)
- `ANZ FILM FESTIVAL: WE BURY THE DEAD` → `We Bury the Dead` (linked to existing)
- `ANZ FILM FESTIVAL: SHORT FILM SHOWCASE` → marked as festival compilation
- `ANZ Film Festival: KOKA` → `Koka` (linked to existing)

**London Short Film Festival (10 films):**
- `LSFF: Express Yourself` → `Express Yourself` ✓ TMDB matched
- `LSFF: Midnight Movies` → `Midnight Movies: From the Margin to the Mainstream` ✓ TMDB matched
- `LSFF: WTF?!` → `WTF?!`
- `LSFF: Eye to Eye` → `Eye to Eye`
- Plus 6 more LSFF documentary programs

**Other Festivals (2 films):**
- `London Short Film Festival Showcase: Palestine Looks Back` → `Palestine Looks Back`
- `Iris LGBTQ+ Film Festival On the Move: Best Bits + Q&A` → `Best Bits + Q&A`

### Event Series Fixed (9 films)

**The Liberated Film Club (2):**
- `The Liberated Film Club: Mihály Víg` → `Mihály Víg`
- `The Liberated Film Club: Jennifer Lucy Allan` → `Jennifer Lucy Allan`

**Saturday Morning Picture Club (1):**
- `Saturday Morning Picture Club: The Princess and The Frog` → merged into existing

**Drink & Dine (5):**
- `DRINK & DINE: The Greatest Showman Sing-A-Long` → merged into `The Greatest Showman`
- `Drink & Dine: Is This Thing On?` → merged into existing
- `Drink & Dine: Sinners` → `Sinners`
- `DRINK & DINE: Grease Sing-Along!` → merged into `Grease`
- `DRINK & DINE: Bohemian Rhapsody Sing-Along` → merged into `Bohemian Rhapsody`

**Kids Club (1):**
- `Kids Club: The Wild Robot` → merged into existing

### Live Broadcasts Reclassified (9 films)

All now have `contentType: "live_broadcast"`:
- `Met Opera Live: Tristan and Isolde (2026)` - opera ✓ has poster
- `Met Opera 2025-26: Tristan und Isolde` - opera
- `National Theatre Live: Hamlet (2026)` - theatre ✓ has poster
- `National Theatre Live: The Fifth Step` - theatre ✓ has poster
- `National Theatre Live: The Audience (2026 Encore)` - theatre ✓ has poster
- `National Theatre Live: All My Sons` - theatre ✓ has poster
- `NT Live: The Audience` - theatre ✓ has poster
- `National Theatre Live: The Audience (Re-release)` - theatre (no poster)
- `EXHIBITION ON SCREEN: Turner & Constable` - exhibition

### Duplicates Merged (11 pairs)

- `Dune: Part One` → `Dune`
- `Twin Peaks: Pilot - Northwest Passage` → `Twin Peaks`
- `La Belle et la Bete + pre-recorded intro` → `Beauty and the Beast`
- `Blue Has No Borders + Jessi Gutch Q&A` → `Blue Has No Borders`
- `NT Live: The Fifth Step` → `The Fifth Step`
- `Queer Horror Nights: THE ROCKY HORROR PICTURE SHOW` → `The Rocky Horror Picture Show`
- `Dildo Heaven` → merged
- `The Art Life` → `Art/Life: The Futurism Revolution`
- `The Princess and the Frog` → merged
- `The Greatest Showman` → merged
- `Kangaroo` (2 copies) → merged with TMDB match

### Non-Film Content Reclassified (55 films)

- **discussions (4):** Q&A sessions, panel discussions
- **season_programming (4):** John Schlesinger season
- **clubs (3):** Filmmakers clubs
- **quizzes (4):** Film quizzes
- **talks (6):** In-conversations, intros
- **events (20+):** Special events, showcases
- **workshops:** Art, poetry workshops
- **shorts_collection:** Short film collections

## Remaining Items

8 titles still flagged as "problematic" but are correctly classified:
- 7 live broadcasts (theatre/opera) - correctly have contentType
- 1 double bill - correctly marked as double_feature

These are intentionally kept with descriptive titles.

## Verification

Check the fixes:
```bash
# Run analysis
npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register src/scripts/analyze-film-data-quality.ts

# Check specific film
npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register -e '
const { db } = require("@/db");
const { films } = require("@/db/schema");
const { eq } = require("drizzle-orm");

async function check() {
  const f = await db.select().from(films).where(eq(films.title, "Kangaroo"));
  console.log(f[0]);
  process.exit(0);
}
check();
'
```

## Co-Authored-By
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
