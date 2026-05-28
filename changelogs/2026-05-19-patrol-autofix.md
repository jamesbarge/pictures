# scripts/patrol-autofix.ts — auto-fix loop for dirty-title detector hits

**PR**: TBD
**Date**: 2026-05-19

## Changes

Adds `scripts/patrol-autofix.ts` — an idempotent, cron-safe script that auto-applies fixes for the dirty-title issue types data-check now surfaces (PR #568).

### Fix passes

| Pass | Detector → Fix | Implementation |
| ---- | -------------- | -------------- |
| 1 | `dirty_title_html_entity` → decode | Direct entity-table replacement (`&amp;` → `&`, etc.) |
| 2 | `dirty_title_all_caps` → smart-title-case | Acronym-preserving title-case (LVSFF, SXSW, BFI, IMAX kept caps; "of/the/and" stay lower). Guarded by the same false-positive filter as the detector — single stylized words (DUNE, BLADE, WALL-E) are skipped. |
| 3 | `dirty_title_event_prefix` + `dirty_title_format_suffix` → strip | Delegates to existing `cleanFilmTitleWithMetadata` so the patrol uses the same logic as the scrape-time pipeline. |
| 4 | `suspicious_orphan_film` + known non-film matches → reclassify | Looks up `getKnownNonFilmType` against the patrol's learnings file. Sets `content_type` to `event` / `live_broadcast`. Never touches films with a TMDB ID. |

### Guards

- **Collision check** before any UPDATE — never renames onto an existing title.
- **Recent-match guard** — skips films where `matched_at` is within 24h (mirrors the data-check skill's idempotency rule).
- **TMDB ID guard** — Pass 4 never reclassifies a film that has a TMDB ID.
- **Dry-run mode** — `--dry-run` flag previews all changes without writing.
- **Selective mode** — `--only=html_entity,event_prefix` runs only specific passes.

### Tests

`scripts/patrol-autofix.test.ts` adds 11 vitest cases pinning the three pure helpers:
- `decodeHtmlEntities` — all 10 supported entities + numeric character references.
- `smartTitleCase` — multi-word title-casing, acronym preservation, article/preposition lowercasing, colon/hyphen boundaries.
- `shouldFlagAllCaps` — exhaustively covers the false-positive guards (DUNE, BLADE, WALL-E, II, STAR WARS skip; long multi-word ALL CAPS flag).

`vitest.config.ts` extended to include `scripts/**/*.test.ts` so script-level tests are picked up by `npm run test:run`. No impact to existing test coverage.

## Impact

Closes the detect→fix loop for the patrol. Previously each new data-check issue type required a corresponding fix to be wired into the slash-command Phase 2 logic. Now the patrol can run `npx tsx scripts/patrol-autofix.ts` between/within cycles and resolve dirty-title issues automatically.

First live run: 3 ALL CAPS smart-title-cased, 6 non-films reclassified. Second run: 0 changes (idempotent).

## Files

- `scripts/patrol-autofix.ts` (new, 188 lines)
- `scripts/patrol-autofix.test.ts` (new, 11 tests)
- `vitest.config.ts` (1-line include addition)
