# CLAUDE.md

Claude compatibility shim for this repository.

## Canonical Rules
- **Source of truth**: `AGENTS.md`
- If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.
- Keep this file concise; do not duplicate the full rule set here.

## Required Navigation Order
1. `AGENTS.md`
2. `AI_CONTEXT.md` (if present on the branch)
3. `RECENT_CHANGES.md`
4. `ARCHITECTURE.md`

## Mandatory Process
- Use feature branches; never commit directly to `main`.
- Keep changes scoped to the request.
- Before marking work complete, run:
  - `npm run test:run`
  - `npm run lint`
  - `npx tsc --noEmit`
- On every PR/direct ship, update both changelog locations:
  - `RECENT_CHANGES.md` (new entry at top, keep ~20)
  - `changelogs/YYYY-MM-DD-short-description.md`

## Scraper Documentation Rule
- For scraper changes, update `src/scrapers/SCRAPING_PLAYBOOK.md`.
- Do not reference `docs/scraping-playbook.md`.

For full project rules, conventions, and constraints, read `AGENTS.md`.
