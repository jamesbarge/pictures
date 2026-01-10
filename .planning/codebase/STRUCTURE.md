# Codebase Structure

**Analysis Date:** 2026-01-10

## Directory Layout

```
filmcal2/
├── src/                      # Main source code
│   ├── app/                  # Next.js App Router (pages, API routes)
│   ├── components/           # React components
│   ├── db/                   # Database schema and utilities
│   ├── lib/                  # Shared utilities and services
│   ├── scrapers/             # Cinema data extraction
│   ├── stores/               # Zustand state stores
│   ├── agents/               # AI data quality agents
│   ├── inngest/              # Background job definitions
│   ├── hooks/                # React hooks
│   ├── types/                # TypeScript type definitions
│   └── test/                 # Test utilities and setup
├── e2e/                      # Playwright E2E tests
├── public/                   # Static assets
├── docs/                     # Documentation
├── .github/                  # GitHub Actions workflows
└── .planning/                # GSD planning files
```

## Directory Purposes

**src/app/**
- Purpose: Next.js App Router pages and API routes
- Contains: `page.tsx`, `layout.tsx`, `route.ts` files
- Key files:
  - `page.tsx` - Main calendar view
  - `layout.tsx` - Root layout with providers
  - `api/screenings/route.ts` - Primary data endpoint
- Subdirectories:
  - `admin/` - Admin dashboard pages
  - `api/` - API route handlers
  - `cinemas/`, `film/`, `festivals/` - Feature pages
  - `sign-in/`, `sign-up/` - Clerk auth pages

**src/components/**
- Purpose: Reusable React components
- Contains: TSX components organized by feature
- Key files:
  - `providers.tsx` - Root provider composition
  - `error-boundary.tsx` - Error handling wrapper
- Subdirectories:
  - `calendar/` - Calendar grid and views
  - `film/` - Film cards and details
  - `filters/` - Filter UI components
  - `layout/` - Header, footer, navigation
  - `ui/` - Base UI components (button, card, modal)

**src/db/**
- Purpose: Database layer
- Contains: Schema definitions, migrations, utilities
- Key files:
  - `index.ts` - Drizzle instance and connection
  - `seed-cli.ts` - Database seeding
  - `enrich-films.ts` - TMDB enrichment script
  - `cleanup-screenings.ts` - Past screening removal
- Subdirectories:
  - `schema/` - Drizzle table definitions
  - `migrations/` - Auto-generated SQL migrations

**src/lib/**
- Purpose: Shared utilities and services
- Contains: Business logic, API clients, helpers
- Key files:
  - `auth.ts` - Clerk authentication helpers
  - `api-errors.ts` - Structured error responses
  - `analytics.ts` - PostHog event tracking
  - `title-extractor.ts` - ML-powered title extraction
- Subdirectories:
  - `tmdb/` - TMDB API client and matching
  - `posters/` - Multi-source poster retrieval
  - `sync/` - User data sync service

**src/scrapers/**
- Purpose: Cinema data extraction
- Contains: Scraper classes, pipeline, utilities
- Key files:
  - `base.ts` - Abstract BaseScraper class
  - `pipeline.ts` - Data normalization and persistence
  - `types.ts` - Scraper type definitions
  - `run-*.ts` - CLI entry points per cinema
- Subdirectories:
  - `cinemas/` - Independent cinema scrapers (BFI, PCC, ICA, etc.)
  - `chains/` - Chain scrapers (Curzon, Picturehouse, Everyman)
  - `utils/` - Date parsing, validation
  - `bfi-pdf/` - BFI PDF processing

**src/stores/**
- Purpose: Client-side state management
- Contains: Zustand stores with persistence
- Key files:
  - `film-status.ts` - Watchlist, seen, not interested
  - `filters.ts` - Calendar filter state
  - `preferences.ts` - User preferences
  - `discovery.ts` - Feature discovery flags

**src/agents/**
- Purpose: AI-powered data quality automation
- Contains: Claude Agent SDK implementations
- Key files:
  - `run-agents.ts` - CLI entry point
  - `index.ts` - Agent orchestrator
  - `config.ts` - Configuration
- Subdirectories:
  - `link-validator/` - Booking URL verification
  - `scraper-health/` - Anomaly detection
  - `enrichment/` - Film metadata enrichment

**src/inngest/**
- Purpose: Background job definitions
- Contains: Inngest function definitions
- Key files:
  - `client.ts` - Inngest client configuration
  - `functions.ts` - Job definitions (scraping, enrichment)

**src/hooks/**
- Purpose: Custom React hooks
- Contains: Reusable hook implementations
- Key files:
  - `useUrlFilters.ts` - URL-based filter sync
  - `useUserSync.ts` - Cloud sync orchestration
  - `useHydrated.ts` - SSR hydration detection

**src/types/**
- Purpose: Shared TypeScript types
- Contains: Type definitions
- Key files:
  - `cinema.ts` - Cinema record types
  - `film.ts` - Film record types
  - `screening.ts` - Screening types

## Key File Locations

**Entry Points:**
- `src/app/page.tsx` - Main calendar page
- `src/app/layout.tsx` - Root layout with providers
- `middleware.ts` - Clerk auth middleware
- `src/scrapers/run-*.ts` - CLI scraper entry points
- `src/agents/run-agents.ts` - Agent CLI entry

**Configuration:**
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript compiler options
- `drizzle.config.ts` - Drizzle ORM config
- `vitest.config.ts` - Test runner config
- `playwright.config.ts` - E2E test config
- `.env.local.example` - Environment variables template

**Core Logic:**
- `src/scrapers/pipeline.ts` - Data normalization
- `src/lib/tmdb/client.ts` - TMDB API client
- `src/lib/sync/user-sync-service.ts` - User data sync
- `src/app/api/screenings/route.ts` - Main data API

**Testing:**
- `src/test/setup.ts` - Global test setup
- `src/test/utils.tsx` - Test utilities
- `src/**/*.test.ts` - Co-located unit tests
- `e2e/*.spec.ts` - Playwright E2E tests

**Documentation:**
- `CLAUDE.md` - AI assistant project rules
- `README.md` - Project overview
- `docs/scraping-playbook.md` - Scraper documentation

## Naming Conventions

**Files:**
- `kebab-case.ts` - TypeScript modules
- `kebab-case.tsx` - React components
- `*.test.ts` - Vitest unit tests (co-located)
- `*.spec.ts` - Playwright E2E tests
- `run-*.ts` - CLI entry points for scrapers

**Directories:**
- kebab-case for all directories
- Plural for collections (`stores/`, `hooks/`, `components/`)
- Feature-based organization within `app/` and `components/`

**Special Patterns:**
- `page.tsx` - Next.js page component
- `layout.tsx` - Next.js layout wrapper
- `route.ts` - Next.js API route handler
- `index.ts` - Barrel exports
- `types.ts` - Type definitions

## Where to Add New Code

**New Feature Page:**
- Page: `src/app/{feature}/page.tsx`
- Layout: `src/app/{feature}/layout.tsx` (if needed)
- Components: `src/components/{feature}/`
- Tests: `src/components/{feature}/*.test.tsx`

**New API Route:**
- Handler: `src/app/api/{endpoint}/route.ts`
- Admin route: `src/app/api/admin/{endpoint}/route.ts`
- Tests: `src/app/api/{endpoint}/route.test.ts`

**New Scraper:**
- Scraper class: `src/scrapers/cinemas/{cinema}.ts` or `src/scrapers/chains/{chain}.ts`
- CLI runner: `src/scrapers/run-{cinema}.ts`
- npm script: Add to `package.json`
- Documentation: Update `docs/scraping-playbook.md`

**New Store:**
- Store: `src/stores/{feature}.ts`
- Tests: `src/stores/{feature}.test.ts`

**New Utility:**
- Implementation: `src/lib/{utility}.ts`
- Tests: `src/lib/{utility}.test.ts`

**New Hook:**
- Hook: `src/hooks/use{Feature}.ts`
- Tests: `src/hooks/use{Feature}.test.ts`

## Special Directories

**.planning/**
- Purpose: GSD planning documents
- Source: Created by /gsd:* commands
- Committed: Yes (project context)

**e2e/**
- Purpose: Playwright E2E tests
- Source: Manual test creation
- Committed: Yes

**public/**
- Purpose: Static assets
- Source: Images, favicons
- Committed: Yes

**node_modules/**
- Purpose: Dependencies
- Source: npm install
- Committed: No (.gitignore)

**.next/**
- Purpose: Next.js build output
- Source: npm run build
- Committed: No (.gitignore)

---

*Structure analysis: 2026-01-10*
*Update when directory structure changes*
