# Changelog Cleanup — Remove Duplicate TMDB-Matcher Entry

**PR**: TBD
**Date**: 2026-06-18

## Changes
- Removed an orphaned, duplicate `## 2026-06-12: TMDB matcher …` entry from `RECENT_CHANGES.md`. The stub had only a header and a `**PR**/Files` line — no body bullets and no `---` separator — and sat directly above the "Untrack tasks/ session scratch" entry. It was introduced during the changelog merges across PRs #668–#677.
- The complete, correctly-formatted "TMDB matcher" entry remains intact lower in the file (with its body and separator).

## Impact
- Documentation only — no code, schema, or runtime behavior changes.
- `RECENT_CHANGES.md` is now well-formed (every entry has a body and a trailing separator).
