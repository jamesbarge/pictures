# Architecture

**Analysis Date:** 2026-01-10

## Pattern Overview

**Overall:** Full-stack Monolithic Web Application with Data Pipeline

**Key Characteristics:**
- Next.js App Router for SSR/SSG pages and API routes
- Data scraping pipeline separate from web serving
- Event-driven background jobs via Inngest
- Client-side state with cloud sync capability
- Multi-source data enrichment (TMDB, OMDB, Fanart.tv)

## Layers

**Presentation Layer:**
- Purpose: User interface and page rendering
- Contains: React components, Next.js pages, layouts
- Location: `src/app/`, `src/components/`
- Depends on: API layer, stores
- Used by: End users via browser

**API Layer:**
- Purpose: HTTP request handling, data access
- Contains: Route handlers, middleware, validation
- Location: `src/app/api/`
- Depends on: Database, services, auth
- Used by: Frontend, external clients, webhooks

**Service Layer:**
- Purpose: Business logic, data processing
- Contains: Film matching, enrichment, sync services
- Location: `src/lib/`
- Depends on: Database, external APIs
- Used by: API routes, scrapers, CLI scripts

**Data Layer:**
- Purpose: Database access and schema
- Contains: Drizzle schema, queries, migrations
- Location: `src/db/`
- Depends on: PostgreSQL (Supabase)
- Used by: Service layer, API routes

**Scraper Layer:**
- Purpose: Extract cinema screening data
- Contains: Scraper classes, pipeline, validators
- Location: `src/scrapers/`
- Depends on: Cheerio, Playwright, pipeline
- Used by: CLI commands, Inngest jobs

**Agent Layer:**
- Purpose: AI-powered data quality automation
- Contains: Link validator, health checker, enrichment
- Location: `src/agents/`
- Depends on: Claude SDK, database
- Used by: CLI commands, cron jobs

**Store Layer:**
- Purpose: Client-side state management
- Contains: Zustand stores with persistence
- Location: `src/stores/`
- Depends on: localStorage, PostHog
- Used by: React components

## Data Flow

**HTTP Request (Screenings API):**

1. User requests `/api/screenings?cinemas=bfi&startDate=2026-01-10`
2. Clerk middleware injects auth context
3. Route handler validates query params with Zod
4. Drizzle query joins screenings, films, cinemas
5. Result cached via `unstable_cache` (60s TTL)
6. JSON response returned to client
7. TanStack Query caches on client

**Scraping Flow:**

1. CLI: `npm run scrape:bfi` or Inngest event
2. `src/scrapers/run-bfi.ts` orchestrates
3. Scraper fetches pages (Playwright or Cheerio)
4. Raw screenings extracted and validated
5. Pipeline (`src/scrapers/pipeline.ts`) processes:
   - Film cache lookup (O(1))
   - Title normalization
   - TMDB matching
   - Poster retrieval
6. Database upsert (films, screenings)
7. Post-scrape agents run health checks

**User Sync Flow:**

1. User signs in via Clerk
2. Webhook fires to `/api/webhooks/clerk`
3. User record created/updated in database
4. `syncUserData()` called
5. localStorage data merged with server
6. Server state becomes source of truth
7. Analytics synced to PostHog

**State Management:**
- Client: Zustand stores with localStorage persistence
- Server: PostgreSQL via Drizzle ORM
- Sync: Bidirectional merge on sign-in (newest wins)

## Key Abstractions

**BaseScraper:**
- Purpose: Template for cinema scrapers
- Location: `src/scrapers/base.ts`
- Pattern: Abstract class with template methods
- Examples: `BFIScraper`, `CurzonScraper`, `PicturehouseScraper`

**Pipeline:**
- Purpose: Normalize and persist scraped data
- Location: `src/scrapers/pipeline.ts`
- Pattern: Data transformation pipeline
- Features: Film cache, TMDB matching, upsert logic

**Zustand Store:**
- Purpose: Client-side state with persistence
- Location: `src/stores/`
- Pattern: Single store per domain
- Examples: `useFilmStatus`, `usePreferences`, `useFilters`

**API Route:**
- Purpose: HTTP endpoint handler
- Location: `src/app/api/*/route.ts`
- Pattern: Named exports (GET, POST, PUT, DELETE)
- Features: Zod validation, error handling

**Agent:**
- Purpose: AI-powered data quality task
- Location: `src/agents/`
- Pattern: Claude Agent SDK functions
- Examples: Link validator, scraper health, enrichment

## Entry Points

**Web Application:**
- Location: `src/app/layout.tsx`
- Triggers: HTTP requests to any route
- Responsibilities: Root layout, providers (Clerk, PostHog, Sentry)

**Main Page:**
- Location: `src/app/page.tsx`
- Triggers: GET `/`
- Responsibilities: Calendar view, force-dynamic rendering

**API Routes:**
- Location: `src/app/api/*/route.ts`
- Triggers: HTTP requests
- Responsibilities: Data CRUD, webhooks, cron jobs

**CLI Scripts:**
- Location: `src/scrapers/run-*.ts`, `src/db/*.ts`, `src/agents/run-agents.ts`
- Triggers: npm scripts
- Responsibilities: Scraping, migrations, data quality

**Middleware:**
- Location: `middleware.ts`
- Triggers: Every request (configurable)
- Responsibilities: Clerk auth context injection

## Error Handling

**Strategy:** Throw errors, catch at boundaries

**Patterns:**
- Custom error classes in `src/lib/api-errors.ts`
- `handleApiError()` wrapper for API routes
- Try-catch at service boundaries
- Sentry captures unhandled exceptions

**Error Types:**
- `BadRequestError` - Invalid input
- `NotFoundError` - Resource not found
- `UnauthorizedError` - Auth required
- `ForbiddenError` - Permission denied

## Cross-Cutting Concerns

**Logging:**
- Console.log/warn/error for development
- Sentry breadcrumbs for error context
- PostHog events for user actions
- Structured logging in scrapers

**Validation:**
- Zod schemas at API boundaries
- TypeScript types throughout
- Screening validator in pipeline
- Date parser with AM/PM handling

**Authentication:**
- Clerk middleware on all routes
- `requireAuth()` for protected endpoints
- `getCurrentUserId()` for optional auth
- Admin routes require sign-in

**Caching:**
- `unstable_cache` for API responses
- TanStack Query for client-side
- Film cache in scraping pipeline
- Next.js static generation where applicable

---

*Architecture analysis: 2026-01-10*
*Update when major patterns change*
