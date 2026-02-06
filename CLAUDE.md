# CLAUDE.md

Claude-specific compatibility shim.

## Canonical Rules
- **Source of truth**: `AGENTS.md`
- If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.

## Required Read Order
1. `AGENTS.md`
2. `AI_CONTEXT.md`
3. `RECENT_CHANGES.md`
4. `ARCHITECTURE.md`

## Non-Negotiable Workflow
- Use feature branches (never commit directly to `main`).
- Keep changes minimal and scoped to the request.
- Before finishing: run `npm run test:run`, `npm run lint`, and `npx tsc --noEmit`.
- Update both changelog locations on every PR:
  - `RECENT_CHANGES.md`
  - `changelogs/YYYY-MM-DD-short-description.md`

## Scraper Rules
- Always preserve AM/PM context when parsing times.
- If hour is `1-9` without AM/PM, assume PM.
- Treat `<10:00` times as likely parsing errors and investigate.
- Use shared parser at `src/scrapers/utils/date-parser.ts`.
- Keep scraper implementation notes in `src/scrapers/SCRAPING_PLAYBOOK.md`.

## Quick Command Reference
```bash
npm run dev
npm run test:run
npm run lint
npx tsc --noEmit
npm run scrape -- <slug>
npm run agents
```

## Where To Navigate
- App/UI: `src/app/`, `src/components/`
- APIs: `src/app/api/`
- Scrapers: `src/scrapers/`
- Database: `src/db/`
- Agents: `src/agents/`

For deeper context and task routing, use `AI_CONTEXT.md`.
