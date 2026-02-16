# Comprehensive Upcoming Screenings Data Quality Orchestrator

**PR**: TBD
**Date**: 2026-02-16

## Changes

- **New orchestrator script** (`scripts/audit-and-fix-upcoming.ts`) that chains 8 passes for systematic data quality improvement of all upcoming screenings
- **npm script**: `npm run audit:fix-upcoming` (with `--dry-run` support)

### Pass Architecture

1. **Pre-flight audit** - Captures baseline metrics (TMDB, poster, synopsis, Letterboxd, year, directors, genres, runtime) for before/after comparison
2. **Non-film detection** - Classifies unmatched entries as `live_broadcast`, `concert`, or `event` using heuristic patterns (NT Live, Met Opera, Royal Ballet, quiz nights, workshops, etc.). Deletes non-viewable events, reclassifies broadcasts/concerts
3. **Duplicate detection & merge** - Shells out to `cleanup-duplicate-films.ts` (TMDB ID + trigram similarity)
4. **Title cleanup + TMDB + metadata + Letterboxd** - Shells out to `cleanup:upcoming` (4-phase pipeline)
5. **Fallback enrichment** - Shells out to `agents:fallback-enrich` (Claude Haiku + booking page scraping)
6. **Poster audit & fix** - Shells out to `poster:audit --upcoming-only` (5-phase poster pipeline)
7. **Dodgy entry detection** - Flags entries with: titles >80 chars, ALL CAPS without TMDB match, year outliers, runtime outliers, and fully unmatched films (no TMDB + no poster + no synopsis)
8. **Final audit** - Comparison table showing before/after delta for all metrics

### CLI Flags

- `--dry-run` - Propagated to all sub-scripts
- `--pass N` - Run only pass N
- `--skip N,N` - Skip specific passes (e.g., `--skip 5,6` to skip slow enrichment)

## Impact

- Provides a single command to systematically clean all upcoming screenings data
- Error-isolated passes ensure one failure doesn't block subsequent passes
- Before/after comparison validates that each run actually improves data quality
- Uses `execFileSync` instead of `exec` for shell safety
