# Align Agent Documentation Process

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Added a mandatory documentation-navigation section to `AGENTS.md`.
- Established `AGENTS.md` as canonical and required `CLAUDE.md` to remain a concise compatibility shim.
- Added a required read order (`AGENTS.md` -> `AI_CONTEXT.md` if present -> `RECENT_CHANGES.md` -> `ARCHITECTURE.md`).
- Updated scraper documentation references from `docs/scraping-playbook.md` to `src/scrapers/SCRAPING_PLAYBOOK.md`.
- Replaced duplicated long-form content in `CLAUDE.md` with concise process-critical guidance that defers to `AGENTS.md`.

## Impact
- Reduces rule drift and contradictory guidance between assistant instruction files.
- Improves onboarding consistency for agents by enforcing a single canonical source and fixed documentation read order.
- Keeps scraper documentation references aligned with the current tracked playbook location.
