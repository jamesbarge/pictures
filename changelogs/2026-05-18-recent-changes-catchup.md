# RECENT_CHANGES catch-up — entries for session test-coverage PRs

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `RECENT_CHANGES.md` — adds 6 new entries (1 per deferred-changelog PR shipped this session: #521, #523, #524, #525, #526, #528).
- `RECENT_CHANGES.md` — corrects the `**PR**: TBD` on the typo-fix entry to `**PR**: #519`.
- `RECENT_CHANGES.md` — trims older entries from the bottom to maintain the CLAUDE.md "~20 most recent" guideline (was at 24, would have been 31 after the catch-up additions; trimmed back to 20).

## Context
Over the course of this session, 6 test-coverage PRs (#521, #523, #524, #525, #526, #528) deliberately omitted their `RECENT_CHANGES.md` top-of-file entry to avoid a rebase-conflict cascade. Each entry would conflict with every other open PR also adding to line 1, and each merge would invalidate the others. The pattern adopted was: ship with the dedicated `changelogs/YYYY-MM-DD-*.md` archive file only, and follow up with a batch catch-up PR at session end. This is that catch-up PR.

The dedicated `changelogs/` archive files for each PR are already on `main` — this PR is the visible "summary at the top of the file" half of the project's two-location changelog convention.

## Why this workflow
The two-location convention (`RECENT_CHANGES.md` + `changelogs/YYYY-MM-DD-*.md`) is great for sequential single-PR sessions but breaks down at >2 concurrent PRs because of guaranteed top-of-file conflicts. A future tooling improvement could mitigate this:

- **Option A**: a `pnpm changelog:bake` script that scans `changelogs/*.md` for entries with `PR: TBD` and pre-pends a one-line summary to `RECENT_CHANGES.md`, run by the merge bot.
- **Option B**: change `RECENT_CHANGES.md` format to an auto-generated TOC of `changelogs/*.md` files, generated on merge.

Worth considering for a follow-up. The current PR just unblocks the immediate session.

## Impact
- Documentation: brings `RECENT_CHANGES.md` to a current, consistent state.
- Convention compliance: each PR shipped in this session now has both required changelog touchpoints (archive + summary line).
- No code changes.

## Verification
- `grep -c "^## " RECENT_CHANGES.md` returns `20` (target per CLAUDE.md).
- Top 6 new entries reference the 6 deferred PRs correctly.
- Typo-fix entry now shows `**PR**: #519`.

## Trimmed entries
The 11 entries removed from the bottom were dated 2026-05-14 through 2026-05-17 and covered: multi-day rolling calendar, screening de-dup, /scrape recurring-fix pushes, /scrape is_repertory follow-ups, /goal command, Bertha DocHouse scraper, Cinema Museum scraper, /goal conditions #6/#7/#8/#9, DQS verifier repair. The full text of each remains in `changelogs/*.md` per the trim convention.
