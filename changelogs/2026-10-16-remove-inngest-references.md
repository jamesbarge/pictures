# Remove Inngest from the docs

**PR**: #817
**Date**: 2026-10-16

## Changes

- `README.md` described Inngest (daily, 06:00 UTC) and GitHub Actions (weekly) as the scrape schedule. Both are gone. The section now says every scrape runs from the Mac through `npm run scrape:unified` or `npm run scrape <cinema-id>`, and that a screening with no matching `scraper_runs` row points to a leftover cloud job.
- `.planning/codebase/` (ARCHITECTURE, CONCERNS, INTEGRATIONS, STACK, STRUCTURE) pointed at the deleted `src/inngest/` and `/api/inngest`. Those lines are removed.
- Kept on purpose: changelogs, `plans/HANDOFF-2026-06-11.md`, `tasks/lessons.md` and a comment in `src/app/api/admin/scrape/all/route.test.ts`. They record the removal.

## Impact

- Nobody reading the README goes looking for a cloud scheduler that no longer exists.
- Context: the orphaned Inngest app `pictures-london` was archived on 16 Oct 2026 after it kept writing BST-shifted rows, the legacy `nickel` cinema and raw titles every morning at 06:00 UTC (see `2026-10-16-nickel-duplicates-and-title-cleaning.md`). The Inngest keys still set on the Vercel project and the pre-#478 deployment it called are removed outside the repo.
