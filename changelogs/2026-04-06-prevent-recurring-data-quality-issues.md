# Prevent Recurring Data Quality Issues at Source

**PR**: #408
**Date**: 2026-04-06

## Changes
- Add 10 new event prefix patterns to title cleaner (Lob-sters Tennis, Gate's Birthday, Spare Ribs Club, Parents and Baby, Reece Shearsmith Presents, Bloody Mary Film Club, LRB Screen x MUBI, UKAFF Closing Night, Phoenix Classics + YSP, N and Under)
- Add 3 anniversary suffix patterns: (Nth Anniversary), - Nth Anniversary, (4K Restoration)
- Fix HTML entity mojibake: decode &Acirc; before &frac12; so Close-Up Cinema's "8&Acirc;&frac12;" becomes "8½"
- Widen pipeline AI confidence threshold from "low" to "low || medium" for regex fallback (with !canonicalTitle guard)
- Auto-set Letterboxd URL (letterboxd.com/tmdb/{id}) when creating films with TMDB matches
- Add daily sweep Phase 0: bulk-set Letterboxd URLs for existing films with TMDB ID but no LB URL

## Impact
- Prevents ~15 duplicate film merges per scrape cycle
- Eliminates recurring 8½ mojibake duplicate (appeared 4x across cycles)
- Improves TMDB match rate for BFI event-prefixed films (~30% more titles cleaned)
- Eliminates need for manual Letterboxd URL enrichment
- Data-check patrol becomes monitoring-only instead of active fixer
