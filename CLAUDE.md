# CLAUDE.md

Claude-specific compatibility shim.

## Canonical Rules
- Source of truth: `AGENTS.md`
- If this file conflicts with `AGENTS.md`, follow `AGENTS.md`
- Keep this file concise; do not duplicate full rule sets

## Required Read Order
1. `AGENTS.md`
2. `AI_CONTEXT.md` (if present)
3. `RECENT_CHANGES.md`
4. `ARCHITECTURE.md`

## Non-Negotiable Workflow
- Use feature branches (never commit directly to `main`)
- Keep changes minimal and scoped to the request
- Before finishing: run `npm run test:run`, `npm run lint`, and `npx tsc --noEmit`
- Update both changelog locations on every PR:
  - `RECENT_CHANGES.md`
  - `changelogs/YYYY-MM-DD-short-description.md`

## Scraper Documentation Rule
- Keep scraper implementation notes in `src/scrapers/SCRAPING_PLAYBOOK.md`
- Do not reference `docs/scraping-playbook.md`

For full project rules, conventions, and constraints, read `AGENTS.md`.
