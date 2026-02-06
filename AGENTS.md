## Project Overview
London cinema calendar app (Pictures) that scrapes screening data from cinemas across London and displays it in a unified calendar view. We cover all cinemas with a special focus on independent venues. Production: https://pictures.london

## Documentation Entry Points
- Start with `AI_CONTEXT.md` for task routing and high-signal docs when present.
- `AGENTS.md` is canonical; if any other file conflicts with it, follow this file.
- Keep `CLAUDE.md` as a concise compatibility shim that points back to `AGENTS.md`.
- Scraper operational notes live in `src/scrapers/SCRAPING_PLAYBOOK.md`.
- Recent context is in `RECENT_CHANGES.md`; full history is in `changelogs/`.

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

## Changelogs - PRIORITY
**Every PR or direct ship to main MUST update BOTH changelog locations.**

### 1. Quick Summary: `RECENT_CHANGES.md` (root)
Add a new entry **at the top** of the file. Keep only the last ~20 entries.

Format:
```markdown
## YYYY-MM-DD: Short Description
**PR**: #XX | **Files**: `path/to/file.ts`, `other/file.ts`
- What changed (bullet points)
- Why it matters

---
```

### 2. Detailed Archive: `/changelogs/YYYY-MM-DD-short-description.md`
Create a new file with full details including impact and context.

Format:
```markdown
# Short Description

**PR**: #XX
**Date**: YYYY-MM-DD

## Changes
- Detailed bullet points

## Impact
- Who/what this affects
```

## Git Workflow
- **Never commit directly to `main`**; use feature branches (`fix/...`, `feat/...`).
- Use conventional commits (`fix:`, `feat:`, `chore:`, `docs:`).
- Include `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` when AI-assisted.
- Create PRs and squash-merge unless explicitly told otherwise.

## Tech Stack
- Next.js 16 App Router, React 19
- Drizzle ORM with PostgreSQL on Supabase (not Neon)
- Scrapers: Playwright (JS-heavy), Cheerio (static), API-based
- date-fns for date manipulation
- Clerk for auth, PostHog for analytics, Zustand for client state

## Scraper Architecture
- All scrapers extend `BaseScraper` (`src/scrapers/base.ts`)
- Chains: `src/scrapers/chains/` (Curzon, Picturehouse, Everyman)
- Independents: `src/scrapers/cinemas/` (BFI, PCC, ICA, Barbican, Rio, etc.)
- Types: Playwright (JS-heavy), Cheerio (static), API-based

## Critical Scraper Rules
- Always capture AM/PM when parsing times; use full element text, not inner nodes.
- If hour is 1-9 without AM/PM, assume PM.
- Times before 10:00 are likely errors; validate and warn.
- Use the shared parser at `src/scrapers/utils/date-parser.ts`.
- When fixing/modifying scrapers, update `src/scrapers/SCRAPING_PLAYBOOK.md` with selectors, URL patterns, formats, and known issues.
- After time parsing fixes, clean up bad data (screenings 00:00-09:59).

## Scraper Testing
- Verify actual database values, not just counts.
- Validate times are sensible (most screenings 10:00-23:59).
- Confirm a few films match the cinema website.

## Data Integrity
- Scrapers should add new screenings; do not delete valid future screenings.
- Only delete screenings for confirmed parsing errors, true duplicates, or orphaned records.

## Database Rules
- Filter past screenings using current time (`new Date()`), not start of day.
- Use `gte(screenings.datetime, now)` for server-side filtering.
- Times stored in UTC, displayed in UK timezone.
- **Never delete screenings** unless confirmed incorrect (parsing errors, duplicates, or orphaned).
- Cleanup scripts:
  - `db:cleanup-screenings` removes past screenings only
  - `db:cleanup-films` removes orphaned films with no screenings

## UI Rules
- Display times in 24-hour format (e.g., "14:15").

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

## State Management
- Zustand stores in `src/stores/` (`film-status.ts`, `preferences.ts`, `filters.ts`).
- Stores integrate with PostHog for analytics tracking.

## Environment Variables
Required in `.env.local` (see `.env.local.example`):
- `DATABASE_URL` (Supabase connection string)
- `TMDB_API_KEY` / `TMDB_READ_ACCESS_TOKEN`
- `NEXT_PUBLIC_CLERK_*`
- `NEXT_PUBLIC_POSTHOG_*`
- `CRON_SECRET`
- `ANTHROPIC_API_KEY`

## API Routes
- Screenings API: `/api/screenings`
- User APIs: `/api/user/*`

## Data Quality Agents
- Run via `npm run agents` or `agents:links`, `agents:health`, `agents:enrich`.

# Agent Rules <!-- tessl-managed -->

@.tessl/RULES.md follow the [instructions](.tessl/RULES.md)
