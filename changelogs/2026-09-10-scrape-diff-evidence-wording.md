# Scrape diff evidence wording

**PR**: #753
**Date**: 2026-09-10

## Changes

- Print the comparison method (lowercased, trimmed title plus UTC instant; next 30 days), explicitly distinguishing it from a write/deletion audit.
- Replace operator-facing added/removed claims with unmatched incoming/existing wording. Retain legacy object property names for compatibility and preserve the blocking `SCRAPER_BROKEN` prefix.
- Replace `RECENTLY_ADDED_THEN_REMOVED` with `RECENTLY_REFRESHED_NOT_MATCHED`: `scraped_at` is refresh evidence, not creation evidence. Null timestamps remain unknown; future-dated refreshes are not labelled recent.
- Keep sequel-title differences and one-hour shifts visible. Do not suppress title differences by matching on source IDs, which could conceal incorrect film identity.

## Impact

The September 9 scrape's title/time diff emitted many warnings that sounded like fresh insertions followed by deletions. These warnings were computed before writes and could arise simply from raw source titles differing from stored film titles. This change corrects the claims; it does not reconcile data or establish which side of a discrepancy is correct.

Seven production-function regression cases cover wording, unknown and future-dated refreshes, empty capture blocking, title/time differences and identical keys. DB leaf calls are mocked; no live database or source correctness is claimed. Full verification results are recorded in the task handoff.

## Limits

Legacy `added`/`removed` object fields and existing key/count semantics remain unchanged. Duplicate candidate cardinality and title canonicalization still affect this diagnostic; it is not a row-identity conservation report. Human-readable log labels and the recent-warning prefix change, so external log consumers (if any) must adopt the new wording. No repository consumers of that warning prefix were found.
