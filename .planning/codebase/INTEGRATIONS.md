# External Integrations

**Analysis Date:** 2026-01-10

## APIs & External Services

**Film Metadata - TMDB:**
- The Movie Database - Primary film enrichment source
  - SDK/Client: Custom client at `src/lib/tmdb/client.ts`
  - Auth: `TMDB_API_KEY` env var
  - Endpoints: Search, details, credits, videos, release dates
  - Features: Film matching, poster URLs, metadata enrichment

**Film Metadata - OMDB:**
- Open Movie Database - Poster fallback source
  - SDK/Client: `src/lib/posters/omdb.ts`
  - Auth: `OMDB_API_KEY` env var
  - Endpoints: Movie search, IMDb lookup
  - Rate limit: 1,000 requests/day (free tier)

**Film Metadata - Fanart.tv:**
- Artistic poster alternatives
  - SDK/Client: `src/lib/posters/fanart.ts`
  - Auth: `FANART_API_KEY` env var
  - Endpoints: Movie images by TMDB/IMDb ID
  - Features: Artistic posters, backgrounds, logos

## Data Storage

**Databases:**
- PostgreSQL on Supabase - Primary data store
  - Connection: `DATABASE_URL` env var (transaction pooler)
  - Client: Drizzle ORM via postgres.js driver
  - Migrations: `src/db/migrations/` via Drizzle Kit
  - Schemas: `src/db/schema/` (cinemas, films, screenings, users, admin)

**File Storage:**
- None currently (posters served from TMDB CDN)

**Caching:**
- Next.js unstable_cache - API response caching (60s TTL)
- TanStack Query - Client-side query caching
- Film cache in pipeline - In-memory during scraping

## Authentication & Identity

**Auth Provider:**
- Clerk - Full authentication solution
  - Implementation: `@clerk/nextjs` with middleware
  - Token storage: Clerk-managed sessions
  - Session management: Automatic via Clerk
  - Helpers: `src/lib/auth.ts` (getCurrentUserId, requireAuth)

**Webhook Verification:**
- Svix - Clerk webhook signature verification
  - Package: `svix 1.84.1`
  - Endpoint: `src/app/api/webhooks/clerk/route.ts`
  - Events: user.created, user.updated, user.deleted, session.created

## Monitoring & Observability

**Error Tracking:**
- Sentry - Server and client errors
  - DSN: `SENTRY_DSN` env var
  - Config: `sentry.server.config.ts`, `sentry.edge.config.ts`
  - Features: Performance tracing (20% prod, 100% dev)
  - Source maps: Uploaded via `SENTRY_AUTH_TOKEN`
  - Tunnel: `/monitoring` route bypasses ad blockers

**Analytics:**
- PostHog - Product analytics and user tracking
  - Client: `posthog-js` at `NEXT_PUBLIC_POSTHOG_KEY`
  - Server: `posthog-node` for backend events
  - Host: EU instance (`https://eu.i.posthog.com`)
  - Integration: `src/lib/analytics.ts`, `src/lib/posthog-server.ts`
  - Tracking: Films, watchlists, searches, filters, bookings
  - Sync: `src/lib/posthog-supabase-sync.ts`

- Vercel Analytics - Web vitals
  - Package: `@vercel/analytics`
  - Auto-integrated with Vercel deployment

- Vercel Speed Insights - Performance monitoring
  - Package: `@vercel/speed-insights`

**Logs:**
- Console logging (stdout) - Captured by Vercel
- Sentry breadcrumbs - Error context

## CI/CD & Deployment

**Hosting:**
- Vercel - Next.js app hosting
  - Deployment: Automatic on git push
  - Environment vars: Vercel dashboard
  - Serverless functions: API routes

**CI Pipeline:**
- GitHub Actions
  - Workflows: `.github/workflows/`
  - Tests: Vitest unit tests, Playwright E2E
  - Linting: ESLint

## Background Jobs

**Job Queue:**
- Inngest - Async task processing
  - Client: `src/inngest/client.ts`
  - Functions: `src/inngest/functions.ts`
  - API: `src/app/api/inngest/route.ts`
  - Auth: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
  - Use cases: Scraping, enrichment, cleanup

**AI Agents:**
- Claude Agent SDK - Data quality automation
  - Package: `@anthropic-ai/claude-agent-sdk`
  - Location: `src/agents/`
  - Auth: `ANTHROPIC_API_KEY`
  - Agents: Link validator, scraper health, enrichment

## Maps & Location

**Mapping:**
- Google Maps JavaScript API - Map display
  - Client: `@vis.gl/react-google-maps`
  - Auth: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

- Google Distance Matrix API - Travel times
  - Server: `src/lib/travel-time.ts`
  - Auth: `GOOGLE_MAPS_API_KEY`
  - Batching: 25 destinations per request

## Environment Configuration

**Development:**
- Required: `DATABASE_URL`, `TMDB_API_KEY`
- Optional: `OMDB_API_KEY`, `FANART_API_KEY`, `GOOGLE_MAPS_API_KEY`
- Secrets: `.env.local` (gitignored)
- Example: `.env.local.example` documents all variables

**Staging:**
- Same Supabase project (or separate staging project)
- Environment-specific via Vercel environments

**Production:**
- Secrets: Vercel environment variables
- Database: Supabase production project
- Monitoring: Sentry production DSN

## Webhooks & Callbacks

**Incoming:**
- Clerk - `/api/webhooks/clerk`
  - Verification: Svix signature validation
  - Events: user.created, user.updated, user.deleted, session.created
  - Handler: `src/app/api/webhooks/clerk/route.ts`

- Inngest - `/api/inngest`
  - Verification: Inngest SDK signature
  - Events: Scraping triggers, job completions

**Outgoing:**
- Slack (optional) - Scraper alerts
  - Config: `SLACK_WEBHOOK_URL` env var
  - Not currently implemented

## Integration Summary

| Service | Purpose | Auth Config |
|---------|---------|-------------|
| Supabase | PostgreSQL database | `DATABASE_URL` |
| TMDB | Film metadata | `TMDB_API_KEY` |
| OMDB | Poster fallback | `OMDB_API_KEY` |
| Fanart.tv | Alternative posters | `FANART_API_KEY` |
| Clerk | Authentication | `NEXT_PUBLIC_CLERK_*` |
| PostHog | Analytics | `NEXT_PUBLIC_POSTHOG_KEY` |
| Sentry | Error tracking | `SENTRY_DSN` |
| Inngest | Background jobs | `INNGEST_*_KEY` |
| Google Maps | Maps & travel times | `GOOGLE_MAPS_API_KEY` |
| Claude | AI agents | `ANTHROPIC_API_KEY` |

---

*Integration audit: 2026-01-10*
*Update when adding/removing external services*
