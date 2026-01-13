## Project Overview
London cinema calendar app (Pictures) that scrapes screening data from cinemas across London and displays it in a unified calendar view. We cover all cinemas with a special focus on independent venues. Production: https://pictures.london

## General Principles
- **Always think about a way to verify your work before starting any work.** Identify how you'll confirm changes work correctly (run tests, check database values, verify in browser, etc.).

## Verification
Before completing any task:
1. Run tests to verify nothing is broken
2. Run type checking and linting
3. Self-review: verify the solution matches the original request
4. Check for regressions in related functionality

Do not claim work is complete until all checks pass. Maximum 3 attempts per issue, then STOP and ask for guidance.

## Avoid
- Don't add new dependencies without asking first
- Don't create new utility files without checking if similar ones exist
- Don't refactor or "improve" code unrelated to the current task
- Don't guess at implementation patterns - check existing code first
- Don't make assumptions about requirements - ask for clarification

## When Stuck
If you encounter repeated failures or uncertainty:
1. Stop after 3 failed attempts
2. Summarize what you tried and why it failed
3. Ask the user for guidance before continuing

## Code Quality
- Read existing code before making changes
- Follow existing patterns and conventions in the codebase
- Keep changes minimal and focused on the task
- Don't over-engineer solutions

## Communication
- Be explicit about what you're doing and why
- Flag any uncertainties or assumptions
- Report errors clearly with context
- Ask clarifying questions early rather than guessing

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

# Agent Rules <!-- tessl-managed -->

@.tessl/RULES.md follow the [instructions](.tessl/RULES.md)
