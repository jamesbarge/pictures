## Project Overview
London cinema calendar app (Pictures) that scrapes screening data from independent cinemas and displays it in a unified calendar view. Production: https://pictures.london

## Tech Stack
- Next.js 16 App Router, React 19
- Drizzle ORM with PostgreSQL on Supabase (not Neon)
- Scrapers: Playwright (JS-heavy), Cheerio (static), API-based
- date-fns for date manipulation
- Clerk for auth, PostHog for analytics, Zustand for client state

## Critical Scraper Rules
- Always capture AM/PM when parsing times; use full element text, not inner nodes.
- If hour is 1-9 without AM/PM, assume PM.
- Times before 10:00 are likely errors; validate and warn.
- Use the shared parser at `src/scrapers/utils/date-parser.ts`.
- When fixing/modifying scrapers, update `docs/scraping-playbook.md` with selectors, URL patterns, formats, and known issues.
- After time parsing fixes, clean up bad data (screenings 00:00-09:59).

## Database Rules
- Filter past screenings using current time (`new Date()`), not start of day.
- Use `gte(screenings.datetime, now)` for server-side filtering.
- Times stored in UTC, displayed in UK timezone.

## Architecture Map
- UI (pages, routes): `src/app/`
- Components: `src/components/`
- Zustand stores: `src/stores/`
- DB schema/migrations/scripts: `src/db/`
- Scrapers: `src/scrapers/` (chains + independents)
- Agents: `src/agents/`
- Shared libs: `src/lib/`

## Auth & User Sync
- Use `getCurrentUserId()` for optional auth.
- Use `requireAuth()` for protected routes.
- Signed-in users sync to cloud; anonymous uses localStorage only.

## Data Quality Agents
- Run via `npm run agents` or `agents:links`, `agents:health`, `agents:enrich`.
