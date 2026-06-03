# data-check.ts — 5 new dirty-title + scraper-health detectors

**PR**: TBD
**Date**: 2026-05-19

## Changes

Added six new issue types to `scripts/data-check.ts` so the patrol surfaces problems the at-scrape `cleanFilmTitle` pipeline misses on pre-existing DB rows.

### Per-film detections (run inside the existing batch loop)

| Issue type | Impact score | Severity | Detection |
| ---------- | ------------ | -------- | --------- |
| `dirty_title_html_entity` | 50 | high | Title contains an undecoded HTML entity (`&amp;`, `&rsquo;`, `&#nnn;`, etc.) |
| `dirty_title_event_prefix` | 40 | high | Title contains a `X presents:` event prefix |
| `dirty_title_all_caps` | 35 | medium | Title is entirely uppercase (with at least 4 consecutive caps) |
| `dirty_title_format_suffix` | 35 | medium | Title ends in `(35mm)`, `(70mm)`, `(IMAX)`, `(Q&A)`, `(VHS SCREENING)`, `(sing-along)`, etc. — these belong on `screening.format` |
| `suspicious_orphan_film` | 22 | medium | Film has exactly one future screening AND no TMDB ID — likely scrape error or misclassified event |

### Global cycle-start detection (runs once when cursor is null)

| Issue type | Impact score | Severity | Detection |
| ---------- | ------------ | -------- | --------- |
| `cinema_screening_drop` | 65 | high | Cinema's 14-day upcoming count is <50% of 14-day rolling average (computed from `scraped_at`-grouped daily counts) — surfaces degraded scrapers automatically |

Each issue includes a `metadata.suggestedFix` string (`decode-html-entities`, `smart-title-case`, `strip-event-prefix`, `strip-format-suffix`, `investigate-or-reclassify`, `investigate-scraper`) so the patrol's auto-fix loop can route to the right handler.

## Impact

- **Production data**: 26 dirty titles in the DB at session start were already cleaned by a parallel one-off script. These detectors ensure the next dirty-title batch (from new scrapes) is caught within one patrol cycle, not lost in the noise.
- **Cinema-drop detection**: previously the patrol had no signal for "this scraper is silently broken" until a scraper-health agent ran separately. The new global check makes the patrol the single source of scraper-degradation alerts.
- **Suspicious-orphan flag**: surfaces ~50 films per cycle that are statistically likely scrape errors (1 future screening + no TMDB match). Patrol can investigate or reclassify without manually digging through 1,100+ future films.

## Testing

- Typecheck (`npx tsc --noEmit`) clean.
- Lint (`npx eslint`) clean for new code (1 pre-existing `any` warning at line 1828 unrelated to this change).
- Standalone verifier script confirmed all 5 per-film detectors and the global cinema-drop SQL run correctly against the live DB.
