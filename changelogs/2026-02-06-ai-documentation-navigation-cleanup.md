# AI Documentation Navigation Cleanup

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Added `AI_CONTEXT.md` as a single navigation index for AI agents and contributors.
- Added `src/scrapers/SCRAPING_PLAYBOOK.md` and updated docs to point to a tracked scraper playbook path.
- Reduced instruction duplication by converting `CLAUDE.md` into a concise compatibility guide that defers to `AGENTS.md` as the canonical rule source.
- Added `changelogs/README.md` to clarify changelog archive workflow.
- Trimmed `RECENT_CHANGES.md` back to ~20 entries per repo policy.
- Removed tracked generated artifact `playwright-report/index.html` and ignored `playwright-report/`.

## Impact
- Improves agent onboarding speed by giving one high-signal documentation entry point.
- Reduces conflicting/stale instruction risk from duplicated long-form rule files.
- Keeps the changelog system maintainable as history grows.
