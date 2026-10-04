# Architecture Overview

London cinema calendar app that scrapes screening data from 25+ independent London cinemas and displays them in a unified, filterable calendar view.

**Production URL: https://pictures.london**

## Directory Structure

```
filmcal2/
├── frontend/                   # SvelteKit public site (pictures.london)
│
├── src/                        # Next.js app (api.pictures.london)
│   ├── app/                    # App Router: API routes, admin, sign-in
│   │   ├── api/                # REST API endpoints
│   │   │   ├── screenings/     # Main data API
│   │   │   ├── films/          # Film metadata
│   │   │   ├── user/           # User preferences & sync
│   │   │   └── cron/           # Scheduled jobs
│   │   └── admin/              # Admin dashboard
│   │
│   ├── components/             # Admin UI primitives (ui/) and Clerk wrappers
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
│   ├── hooks/                  # React hooks
│   │   └── useHydrated.ts      # SSR hydration safety
│   │
│   └── test/                   # Test utilities
│
├── AI_CONTEXT.md               # AI/navigation entry point
├── changelogs/                 # Detailed change archive
│
└── public/                     # Static assets (robots.txt, favicon)
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
│  Enriched Film  │───▶│  Next.js API    │───▶│  SvelteKit UI   │
│     Record      │    │   /screenings   │    │  (frontend/)    │
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

- **Clerk** handles admin sign-in on this app; pictures.london has no accounts
- Auth helpers in `src/lib/auth.ts`:
  - `getCurrentUserId()` - returns null if not signed in
  - `requireAuth()` - throws if not signed in

## Analytics

PostHog integration tracks:
- Film status changes (watchlist add/remove)
- Filter usage
- Search queries
- Page views

The client integration lives in `frontend/src/lib/analytics/posthog.ts`.

## Deployment

- **Vercel** for Next.js hosting
- **Supabase** for PostgreSQL
- **GitHub Actions** for CI/CD
- Cron jobs via Vercel cron or external trigger

## Performance Considerations

- **SSR with hydration**: Use `useHydrated()` hook for localStorage-dependent admin UI
- **Pagination**: Screenings API supports cursor-based pagination
