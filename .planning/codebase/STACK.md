# Technology Stack

**Analysis Date:** 2026-01-10

## Languages

**Primary:**
- TypeScript 5.x - All application code (`tsconfig.json`, `src/**/*.ts`, `src/**/*.tsx`)

**Secondary:**
- JavaScript - Build and configuration files (`.mjs`, config files)

## Runtime

**Environment:**
- Node.js (version not explicitly pinned; no `.nvmrc` present)
- Target: ES2017 (`tsconfig.json`)
- Serverless-compatible (Vercel deployment)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.1.0 - Full-stack React framework with App Router (`next.config.ts`)
  - React Compiler enabled
  - ISR timeout increased to 120s for large query sets
- React 19.2.3 - UI framework
- React DOM 19.2.3

**Database:**
- Drizzle ORM 0.45.1 - TypeScript ORM (`src/db/`)
- Drizzle Kit 0.31.8 - Migrations and schema generation
- postgres.js 3.4.7 - PostgreSQL driver

**Testing:**
- Vitest 4.0.16 - Unit/component tests (`vitest.config.ts`)
- Playwright 1.57.0 - E2E tests and web scraping (`playwright.config.ts`)
- @testing-library/react 16.3.1 - React component testing

**Build/Dev:**
- Webpack 5 (via Next.js)
- ESLint 9 - Linting
- tsx 4.21.0 - TypeScript executor for CLI scripts

## Key Dependencies

**Critical:**
- @clerk/nextjs 6.36.5 - User authentication (`src/lib/auth.ts`)
- zustand 5.0.9 - Client-side state management (`src/stores/`)
- @tanstack/react-query 5.90.12 - Server state caching
- date-fns 4.1.0 - Date manipulation (required, no native Date methods)
- zod 4.2.1 - Schema validation

**Web Scraping:**
- cheerio 1.1.2 - Static HTML parsing (independents)
- playwright 1.57.0 - Browser automation (chains: Curzon, BFI, Everyman)
- playwright-extra 4.3.6 - Playwright extensions
- puppeteer-extra-plugin-stealth 2.11.2 - Bot detection evasion

**Infrastructure:**
- inngest 3.48.1 - Background job queue (`src/inngest/`)
- @sentry/nextjs 10.32.1 - Error tracking
- posthog-js 1.310.1 + posthog-node 5.18.0 - Analytics

**UI:**
- tailwindcss 4 - CSS framework (`postcss.config.mjs`)
- @base-ui/react 1.0.0 - Headless UI components
- lucide-react 0.562.0 - Icon library
- react-day-picker 9.13.0 - Calendar component

**Mapping:**
- @vis.gl/react-google-maps 1.7.1 - Google Maps component
- @turf/turf 7.3.1 - Geospatial analysis

## Configuration

**Environment:**
- `.env.local` for secrets (gitignored)
- `.env.local.example` documents required variables
- `dotenv-cli` for CLI commands: `dotenv -e .env.local -- [command]`

**Key configs:**
- `DATABASE_URL` - Supabase PostgreSQL connection (transaction pooler)
- `TMDB_API_KEY` - Film metadata enrichment
- `ANTHROPIC_API_KEY` - Claude agents
- `NEXT_PUBLIC_CLERK_*` - Authentication
- `NEXT_PUBLIC_POSTHOG_*` - Analytics

**Build:**
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript compiler options
- `drizzle.config.ts` - ORM migration config
- `vitest.config.ts` - Test runner config
- `playwright.config.ts` - E2E test config

## Platform Requirements

**Development:**
- macOS/Linux/Windows (any platform with Node.js)
- No Docker required for local development
- PostgreSQL via Supabase (remote)

**Production:**
- Vercel - Primary hosting platform
- Supabase - PostgreSQL database hosting
- Serverless functions with connection pooling
- Playwright scrapers require dedicated server (not Vercel)

---

*Stack analysis: 2026-01-10*
*Update after major dependency changes*
