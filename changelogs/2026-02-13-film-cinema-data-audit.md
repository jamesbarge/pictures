# Film & Cinema Data Audit — Duplicate Cleanup

**PR**: TBD
**Date**: 2026-02-13

## Changes

### Film Duplicates (30 deleted)
- Merged 17 event-prefix duplicates (DocHouse:, Film Club:, Drink & Dine:, RBO:, Pink Palace:, Varda Film Club:, Awards Lunch:, Bar Trash:, Queer Horror Nights:)
- Merged 10 title-variant duplicates (Little Amelie 6→1, Katyn 3→1, Rocky Horror 3→1, A Private Life, Zola, Metallica)
- Merged 3 suffix duplicates (+Q&A, +Live Music, ON VHS)
- 33 screenings reassigned to keeper films, 43 conflict screenings removed

### Cinema Duplicates (6 legacy IDs deactivated)
- Merged `riverside` → `riverside-studios` (2 moved, 76 conflicts)
- Merged `nickel` → `the-nickel` (2 moved, 46 conflicts)
- Merged `close-up` → `close-up-cinema` (0 moved, 27 conflicts)
- Merged `david-lean` → `david-lean-cinema` (56 moved, 0 conflicts)
- Merged `olympic` → `olympic-studios` (0 moved, 37 conflicts)
- Migrated `phoenix` → `phoenix-east-finchley` (50 screenings)
- Reactivated Garden Cinema (was incorrectly inactive)

### Romford Lumiere Fix
- Fixed Inngest config: URL `lumiere-cinema.co.uk` (dead DNS) → `lumiereromford.com`
- Corrected name, address, postcode, and features to match cinema registry

### Pipeline Prevention (prevent future duplicates)
- Added event prefixes: `Varda Film Club:`, `Awards Lunch:`, `RBO:`
- Fixed sing-along regex to match `Sing-A-Long-A [Title]` without colon
- Added suffix stripping: `+ Live Music`, `(ON VHS)/(ON 35MM)/(ON Blu-ray)`
- Fixed HTML-encoded `+ Q&amp;A` not being caught

## Impact
- Film count: 1049 → 1002 (47 duplicates removed)
- Active cinemas: 61 (all using canonical registry IDs)
- Inactive legacy cinemas: 6 (0 screenings, deactivated)
- No orphaned films remain
