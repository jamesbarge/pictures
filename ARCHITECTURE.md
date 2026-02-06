# Architecture Overview

London cinema calendar app that scrapes screening data from 25+ independent London cinemas and displays them in a unified, filterable calendar view.

**Production URL: https://pictures.london**

## Directory Structure

```
filmcal2/
├── src/
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── api/                # REST API endpoints
│   │   │   ├── screenings/     # Main data API
│   │   │   ├── films/          # Film metadata
│   │   │   ├── user/           # User preferences & sync
│   │   │   └── cron/           # Scheduled jobs
│   │   ├── film/[id]/          # Film detail pages
│   │   └── page.tsx            # Main calendar view
│   │
│   ├── components/             # React components
│   │   ├── calendar/           # Calendar grid, film cards, screening cards
│   │   ├── filters/            # Date, cinema, time filter UI
│   │   ├── layout/             # Header, navigation
│   │   ├── search/             # Search dialog
│   │   ├── settings/           # User settings
│   │   ├── ui/                 # Shared primitives (MobileModal, etc.)
│   │   └── watchlist/          # Watchlist view
│   │
│   ├── scrapers/               # Cinema data scrapers
│   │   ├── base.ts             # Abstract BaseScraper class
│   │   ├── runner.ts           # Unified scraper runner factory
│   │   ├── pipeline.ts         # Scrape → save → enrich orchestration
│   │   ├── chains/             # Multi-venue chains (Curzon, Picturehouse, Everyman)
│   │   ├── cinemas/            # Independent cinemas (BFI, PCC, ICA, etc.)
│   │   └── utils/              # Date parsing, title extraction
│   │
│   ├── agents/                 # Data quality agents (Claude SDK)
│   │   ├── enrichment/         # TMDB matching, title extraction
│   │   ├── link-validator/     # Booking URL verification
│   │   └── scraper-health/     # Anomaly detection
│   │
│   ├── db/                     # Database layer
│   │   ├── schema/             # Drizzle schema (films, screenings, cinemas)
│   │   ├── index.ts            # Database client
│   │   └── *.ts                # Seed scripts, cleanup utilities
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── auth.ts             # Clerk auth helpers
│   │   ├── title-patterns.ts   # Shared title extraction patterns
│   │   ├── title-extractor.ts  # AI-powered title extraction
│   │   └── cn.ts               # Tailwind class merging
│   │
│   ├── stores/                 # Zustand state stores
│   │   ├── film-status.ts      # Watchlist, seen, not interested
│   │   ├── filters.ts          # Current filter state
│   │   └── preferences.ts      # User preferences
│   │
│   ├── hooks/                  # React hooks
│   │   ├── useHydrated.ts      # SSR hydration safety
│   │   └── useBodyScrollLock.ts
│   │
│   └── test/                   # Test utilities
│
├── AI_CONTEXT.md               # AI/navigation entry point
├── changelogs/                 # Detailed change archive
│
├── e2e/                        # Playwright E2E tests
│
└── public/                     # Static assets
```

## Data Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Cinema Website │───▶│    Scraper      │───▶│   PostgreSQL    │
│   (25+ sites)   │    │  (Playwright/   │    │   (Supabase)    │
└─────────────────┘    │   Cheerio/API)  │    └────────┬────────┘
                       └─────────────────┘             │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TMDB API      │◀───│  Enrichment     │◀───│  Raw Screening  │
│  (metadata)     │    │    Agent        │    │      Data       │
└────────┬────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Enriched Film  │───▶│  Next.js API    │───▶│   React UI      │
│     Record      │    │   /screenings   │    │  (Calendar)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Scraper Architecture

All scrapers extend `BaseScraper` and implement a common interface:

```typescript
abstract class BaseScraper {
  abstract scrape(): Promise<RawScreening[]>;
  abstract get name(): string;
  abstract get cinemaId(): string;
}
```

### Scraper Types

| Type        | Use Case                      | Examples                    |
|-------------|-------------------------------|-----------------------------|
| Playwright  | JS-heavy sites, SPAs          | Curzon, BFI, Everyman       |
| Cheerio     | Static HTML                   | PCC, ICA, Barbican, Genesis |
| API-based   | Internal APIs                 | Picturehouse (Vista API)    |

### Running Scrapers

```bash
# Unified CLI (preferred)
npm run scrape bfi        # Single scraper
npm run scrape:all        # All scrapers

# Batch commands
npm run scrape:chains     # Curzon, Picturehouse, Everyman
npm run scrape:independents
```

Scraper change notes and incident patterns are tracked in `src/scrapers/SCRAPING_PLAYBOOK.md`.

## State Management

Zustand stores with localStorage persistence:

```
┌─────────────────────────────────────────────────────────────┐
│                    Zustand Stores                           │
├─────────────────┬─────────────────┬─────────────────────────┤
│  film-status    │    filters      │     preferences         │
│  - watchlist    │  - dateFrom     │  - selectedCinemas      │
│  - seen         │  - dateTo       │  - theme                │
│  - notInterested│  - timeFrom/To  │  - defaultView          │
└────────┬────────┴────────┬────────┴────────────┬────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  localStorage (persist)                      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (when signed in)
┌─────────────────────────────────────────────────────────────┐
│                    Cloud Sync (Supabase)                     │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App
├── Providers (Clerk, PostHog, QueryClient)
│   └── Header
│       ├── Logo
│       ├── SearchButton
│       ├── DateFilter        ← extracted component
│       │   └── MobileDatePickerModal
│       ├── CinemaFilter
│       │   └── MobileCinemaPickerModal
│       └── UserMenu
│
├── CalendarGrid
│   ├── FilmCard
│   │   └── FilmStatusOverlay  ← shared component
│   └── ScreeningCard
│       └── FilmStatusOverlay  ← shared component
│
└── SearchDialog
    └── SearchResults
```

## Title Extraction

Two extractors share patterns from `lib/title-patterns.ts`:

| Extractor | Location | Strategy | Use Case |
|-----------|----------|----------|----------|
| AI-Powered | `lib/title-extractor.ts` | Claude Haiku | Complex event-wrapped titles during scraping |
| Regex-Based | `agents/enrichment/title-extractor.ts` | Pattern matching | Fast TMDB matching in enrichment agent |

Shared patterns include:
- Event prefixes ("Saturday Morning Picture Club:", "35mm:")
- Suffixes to strip ("+ Q&A", "(4K Restoration)")
- Non-film indicators ("Quiz", "Reading Group")
- Franchise detection ("Star Wars: A New Hope" keeps colon)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/screenings` | GET | List screenings with filters |
| `/api/films` | GET | List films |
| `/api/films/[id]` | GET | Film details |
| `/api/user/statuses` | GET/POST | Film watchlist status |
| `/api/user/preferences` | GET/POST | User preferences |
| `/api/user/sync` | POST | Sync localStorage to cloud |
| `/api/cron/scrape` | POST | Trigger scraper (secured) |

## Database Schema

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    cinemas     │     │   screenings   │     │     films      │
├────────────────┤     ├────────────────┤     ├────────────────┤
│ id (slug)      │◀────│ cinema_id      │     │ id (UUID)      │
│ name           │     │ film_id        │────▶│ title          │
│ location       │     │ datetime       │     │ tmdb_id        │
│ chain          │     │ booking_url    │     │ poster_path    │
│ scraper_type   │     │ format         │     │ release_year   │
└────────────────┘     └────────────────┘     │ genres         │
                                              │ runtime        │
                                              └────────────────┘
```

## Authentication

- **Clerk** handles user auth
- Anonymous users: localStorage-only
- Signed-in users: localStorage + cloud sync
- Auth helpers in `src/lib/auth.ts`:
  - `getCurrentUserId()` - returns null if not signed in
  - `requireAuth()` - throws if not signed in

## Analytics

PostHog integration tracks:
- Film status changes (watchlist add/remove)
- Filter usage
- Search queries
- Page views

Events are triggered in Zustand store actions, not UI components.

## Deployment

- **Vercel** for Next.js hosting
- **Supabase** for PostgreSQL
- **GitHub Actions** for CI/CD
- Cron jobs via Vercel cron or external trigger

## Performance Considerations

- **SSR with hydration**: Use `useHydrated()` hook for localStorage-dependent UI
- **React Query**: Caches API responses, avoids redundant fetches
- **Pagination**: Screenings API supports cursor-based pagination
- **Selective store subscriptions**: Use selectors in Zustand to minimize re-renders
