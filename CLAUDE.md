# CLAUDE.md - Project Rules for AI Assistants

## Project Overview
London cinema listings app that scrapes screening data from cinemas across London and displays them in a unified view. We cover all cinemas with a special focus on independent venues.

**Production URL: https://pictures.london**

## General Principles

- **Always think about a way to verify your work before starting any work.** Before implementing changes, identify how you'll confirm the change works correctly (run tests, check database values, verify in browser, etc.).

## Changelogs - PRIORITY

**Every PR or direct ship to main MUST update BOTH changelog locations.**

### 1. Quick Summary: `RECENT_CHANGES.md` (root)
Add a new entry **at the top** of the file. Keep only the last ~20 entries (old ones drop off the bottom).

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

### Why Both?
- `RECENT_CHANGES.md` = Quick AI context at session start (one file to read)
- `/changelogs/` = Permanent archive with full details

## Git Workflow

### Branch Strategy
- **Never commit directly to `main`** - always use feature branches
- Create a new branch for each feature or fix: `git checkout -b fix/scraper-issue` or `feat/new-feature`
- Push the branch and create a Pull Request for review
- Merge PRs into `main` after review

### Commit Messages
- Use conventional commit format: `fix:`, `feat:`, `chore:`, `docs:`
- Keep commits focused and atomic
- Include `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` when AI-assisted

### PR Process
1. Create feature branch from `main`
2. Make changes and commit
3. Push branch: `git push -u origin branch-name`
4. Create PR: `gh pr create --title "..." --body "..."`
5. Squash and merge without needing permission, EXCEPT:
   - Particularly complex features that warrant review
   - When there are multiple PRs waiting (check first)

## Scraping Rules

### Time Parsing - CRITICAL
- **Always capture AM/PM** - Many sites split time elements: `<time>2:15</time>PM`
- Use full element text (`$el.text()`), not just inner elements like `$el.find('time').text()`
- If hour is 1-9 without AM/PM indicator, assume PM - cinema screenings at "2:00" mean 14:00, not 02:00
- Times before 10:00 are almost certainly parsing errors - validate and warn
- Use the shared date parser at `src/scrapers/utils/date-parser.ts` which handles these cases

### Scraper Documentation
- **Always update `docs/scraping-playbook.md`** when fixing or modifying scrapers
- Document: URL patterns, selectors, date/time formats, known issues
- Each cinema has unique quirks - document them for future reference
- When a scraper breaks, check the playbook first before investigating

### Scraper Testing
- Test scrapers by checking actual database values, not just screening counts
- Verify times are sensible (most screenings are between 10:00-23:59)
- Check specific films to confirm times match the cinema website
- Run cleanup after fixing parsing bugs to remove incorrect historical data

### Data Integrity
- Clean up bad data after fixing parsing bugs - don't leave incorrect records
- Screenings with times before 10:00 should be investigated as likely errors
- When re-scraping after a fix, verify old incorrect data doesn't persist

## Database Rules

### CRITICAL: Never Delete Valid Screenings
**DO NOT DELETE SCREENINGS** unless you have confirmed evidence they are incorrect:
- Scrapers should ONLY ADD new screenings, never delete existing ones
- The only valid reasons to delete screenings:
  1. Time parsing bugs created screenings with obviously wrong times (e.g., 02:00 instead of 14:00)
  2. Duplicate screenings with identical film, cinema, and datetime
  3. Screenings for films that don't exist (orphaned foreign keys)
- **Before deleting anything**, always check if the data is actually wrong
- If a scraper returns fewer results than expected, that's NOT a reason to delete - investigate first
- Past screenings naturally expire and are filtered out by queries - no deletion needed

### Screening Filtering
- Filter out past screenings using current time (`new Date()`), not start of day
- Use `gte(screenings.datetime, now)` to exclude screenings that have already started
- A 2pm screening should not appear after 2pm on that day

### Cleanup Scripts
- `db:cleanup-screenings` removes PAST screenings only (already happened)
- `db:cleanup-films` removes orphaned films with no screenings
- **Never run bulk deletes** on future screenings without explicit user confirmation
- When fixing time parsing bugs, only delete screenings with clearly suspicious times (00:00-09:59)

## UI Rules

### Time Display
- Display times in 24-hour format (e.g., "14:15") for clarity
- Past screening filtering is handled server-side (see Database Rules > Screening Filtering)

## Tech Stack
- Next.js 16 with App Router
- **Drizzle ORM with PostgreSQL (Supabase)** - NOT Neon, we use Supabase for database hosting
- Playwright for JS-heavy sites (Curzon, BFI, Everyman)
- Cheerio for static HTML parsing
- date-fns for date manipulation

## Authentication
- **Clerk** for user authentication (`@clerk/nextjs`)
- Use `getCurrentUserId()` from `src/lib/auth.ts` for optional auth (returns null if not signed in)
- Use `requireAuth()` for protected routes (throws if not signed in)
- User data syncs to cloud when signed in, localStorage-only when anonymous

## State Management
- **Zustand** for client-side state with `persist` middleware for localStorage
- Key stores in `src/stores/`:
  - `film-status.ts` - Watchlist, seen, not interested status per film
  - `preferences.ts` - User preferences (selected cinemas, etc.)
  - `filters.ts` - Current filter state for calendar view
- All stores integrate with PostHog analytics for tracking

## Scraper Architecture
- All scrapers extend `BaseScraper` from `src/scrapers/base.ts`
- Two categories:
  - **Chains** (`src/scrapers/chains/`): Curzon, Picturehouse, Everyman - multi-venue
  - **Independents** (`src/scrapers/cinemas/`): BFI, PCC, ICA, Barbican, Rio, etc.
- Scraper types:
  - **Playwright**: For JS-heavy sites (Curzon, BFI, Everyman) - slower but handles dynamic content
  - **Cheerio**: For static HTML (most independents) - faster
  - **API-based**: Picturehouse uses internal API - fastest and most reliable
- Each scraper has a `run-*.ts` file that executes the scraper and saves to DB

## Data Quality Agents
- Located in `src/agents/` - powered by Claude Agent SDK
- Run with `npm run agents` or individual: `npm run agents:links`, `agents:health`, `agents:enrich`
- Agents:
  - **Link Validator**: Checks booking URLs still work
  - **Scraper Health**: Detects anomalies in scraper output
  - **Enrichment**: Matches films to TMDB, extracts clean titles

## Environment Variables
Required in `.env.local` (see `.env.local.example`):
- `DATABASE_URL` - Supabase PostgreSQL connection string (use transaction pooler)
- `TMDB_API_KEY` / `TMDB_READ_ACCESS_TOKEN` - For film metadata enrichment
- `NEXT_PUBLIC_CLERK_*` - Clerk auth keys
- `NEXT_PUBLIC_POSTHOG_*` - Analytics
- `CRON_SECRET` - Secures cron endpoints
- `ANTHROPIC_API_KEY` - For Claude agents

## API Routes
- All in `src/app/api/`
- Screenings API: `/api/screenings` - main data endpoint with cinema/date filtering
- User APIs: `/api/user/*` - film statuses, preferences, sync
- Use Response.json() pattern, not NextResponse

## Key Files
- `src/scrapers/` - All cinema scrapers
- `src/scrapers/base.ts` - Abstract base class for scrapers
- `src/scrapers/utils/date-parser.ts` - Shared date/time parsing utilities
- `src/scrapers/pipeline.ts` - Orchestrates scrape → save → enrich flow
- `docs/scraping-playbook.md` - Documentation for each scraper
- `src/app/page.tsx` - Main calendar view
- `src/db/schema/` - Database schema (split by entity)
- `src/lib/auth.ts` - Auth helpers
- `src/stores/` - Zustand state stores

## Common Commands
```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build

# Scrapers - Chains
npm run scrape:curzon       # Curzon (Playwright)
npm run scrape:picturehouse # Picturehouse (API - fastest)
npm run scrape:everyman     # Everyman (Playwright)

# Scrapers - Independents
npm run scrape:bfi          # BFI Southbank (Playwright)
npm run scrape:pcc          # Prince Charles Cinema
npm run scrape:ica          # ICA
npm run scrape:barbican     # Barbican
npm run scrape:rio          # Rio Cinema
npm run scrape:genesis      # Genesis
npm run scrape:peckhamplex  # Peckham Plex
npm run scrape:nickel       # The Nickel
npm run scrape:electric     # Electric Cinema
npm run scrape:lexi         # Lexi Cinema
npm run scrape:garden       # Garden Cinema

# Batch scrapers
npm run scrape:chains       # All chain cinemas
npm run scrape:independents # All independent cinemas
npm run scrape:all          # Everything

# Database
npm run db:push          # Push schema changes to Supabase
npm run db:seed          # Seed initial data
npm run db:cleanup-screenings  # Remove past screenings
npm run db:cleanup-films       # Remove orphaned films
npm run db:enrich        # Enrich films with TMDB data
npm run db:classify-events     # Classify events vs films

# Agents
npm run agents           # Run all data quality agents
npm run agents:links     # Verify booking links
npm run agents:health    # Check scraper health
npm run agents:enrich    # Enrich film metadata
```

## Code Conventions
- Use `date-fns` for all date manipulation, never native Date methods for formatting
- Film IDs are UUIDs, screening IDs are UUIDs
- Cinema IDs are slugs (e.g., "bfi-southbank", "curzon-soho")
- All times stored in UTC in database, displayed in UK timezone
- PostHog analytics: track meaningful user actions, not every click

## Testing Rules

### Test Requirements
- **All new code must include tests** - PRs adding functionality without tests should include tests
- **Maintain coverage thresholds** - Target: 60% lines, 60% functions (enforced in CI)
- **Run tests before committing** - Use `npm run test:run` to verify changes don't break existing tests

### Test File Locations
- **Unit tests**: Co-located with source files (`foo.ts` -> `foo.test.ts`)
- **E2E tests**: `e2e/` directory
- **Test utilities**: `src/test/` directory (setup, fixtures, helpers)

### Testing Patterns

#### Store Tests (Zustand)
```typescript
// Reset state values before each test (don't use replace: true)
beforeEach(() => {
  useStoreName.setState(initialStateValues);
});

// Call actions via getState()
useStoreName.getState().toggleSomething();
expect(useStoreName.getState().someValue).toBe(expected);
```

#### API Route Tests
```typescript
// Use NextRequest for testing API routes
const request = new NextRequest('http://localhost/api/endpoint?param=value');
const response = await GET(request);
expect(response.status).toBe(200);

const data = await response.json();
expect(data.field).toBeDefined();
```

#### Component Tests (React Testing Library)
```typescript
import { renderWithProviders, screen, userEvent } from "@/test/utils";

it("should handle user interaction", async () => {
  renderWithProviders(<Component />);
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));
  expect(screen.getByText(/success/i)).toBeInTheDocument();
});
```

### Test Commands
```bash
npm run test           # Watch mode (development)
npm run test:run       # Single run (CI/pre-commit)
npm run test:coverage  # With coverage report
npm run test:e2e       # Playwright E2E tests
npm run test:e2e:ui    # Playwright UI mode (debugging)
```

### What to Test
- **Always test**: Zustand stores (state mutations, selectors), utility functions, API routes
- **Test when complex**: React components with significant logic, data transformations
- **Skip testing**: Simple presentational components, third-party library wrappers

### Test Database
- Integration tests that need a database should use `DATABASE_URL_TEST` environment variable
- Test database is a separate Supabase project to avoid polluting production data
- Each test should clean up its own data or use isolated test fixtures

@AGENTS.md
