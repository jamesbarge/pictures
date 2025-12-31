# Pictures

**The London Cinema Calendar** — Aggregating screenings from 20+ independent cinemas into one unified view.

**Live at [pictures.london](https://pictures.london)**

---

## What is this?

London has an incredible independent cinema scene, but finding what's showing means checking 20 different websites. Pictures solves this by scraping listings from venues like BFI Southbank, Prince Charles Cinema, Curzon, Picturehouse, ICA, Barbican, and more — presenting everything in one filterable calendar.

### Features

- **Unified calendar** — All indie cinemas in one view
- **Smart filters** — By cinema, date range, format (35mm/70mm/IMAX)
- **Film tracking** — Mark films as "want to see" or "seen"
- **Daily updates** — Fresh data scraped from each venue
- **Mobile-friendly** — Works great on phone
- **Free** — No ads, no subscription

### Cinemas covered

**Chains:** Curzon (10 venues), Picturehouse (8 venues), Everyman (15+ venues)

**Independents:** BFI Southbank, Prince Charles Cinema, ICA, Barbican, Rio Cinema, Genesis, Peckhamplex, The Nickel, Electric Cinema, Lexi Cinema, Garden Cinema, Close-Up Cinema, Ciné Lumière, Castle Cinema, ArtHouse Crouch End, Phoenix Cinema, Rich Mix, Regent Street Cinema, Riverside Studios, Olympic Cinema, David Lean Cinema

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Supabase |
| ORM | Drizzle |
| Auth | Clerk |
| Analytics | PostHog (EU hosted) |
| Hosting | Vercel |
| Scraping | Playwright + Cheerio |
| AI Agents | Claude Agent SDK |
| Styling | Tailwind CSS v4 |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (we use Supabase)
- TMDB API key (for film metadata)

### Installation

```bash
# Clone the repo
git clone https://github.com/jamesbarge/pictures.git
cd pictures

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Fill in your values (see Environment Variables below)

# Push database schema
npm run db:push

# Seed initial data (cinemas)
npm run db:seed

# Start dev server
npm run dev
```

### Environment Variables

Required variables in `.env.local`:

```bash
# Database (Supabase)
DATABASE_URL=postgresql://...

# TMDB API (for film metadata)
TMDB_API_KEY=your_key
TMDB_READ_ACCESS_TOKEN=your_token

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# PostHog Analytics
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
POSTHOG_API_KEY=phx_...

# Claude Agents (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Cron Security
CRON_SECRET=random_string
```

See `.env.local.example` for the full list with documentation.

---

## Commands

### Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run ESLint
```

### Testing

```bash
npm run test         # Run unit tests (watch mode)
npm run test:run     # Run unit tests once
npm run test:e2e     # Run Playwright E2E tests
```

### Database

```bash
npm run db:push      # Push schema changes
npm run db:studio    # Open Drizzle Studio
npm run db:seed      # Seed cinemas
npm run db:enrich    # Enrich films with TMDB data
npm run db:cleanup-screenings  # Remove past screenings
```

### Scrapers

```bash
# Individual cinemas
npm run scrape:bfi
npm run scrape:pcc
npm run scrape:curzon
npm run scrape:picturehouse
npm run scrape:everyman
# ... (see package.json for full list)

# Batch
npm run scrape:chains       # All chain cinemas
npm run scrape:independents # All indie cinemas
npm run scrape:all          # Everything
```

### AI Agents

```bash
npm run agents          # Run all agents
npm run agents:links    # Verify booking URLs
npm run agents:health   # Check scraper output
npm run agents:enrich   # Improve TMDB matching
```

---

## Architecture

```
src/
├── app/                 # Next.js App Router pages
│   ├── api/             # API routes
│   ├── film/[id]/       # Film detail pages
│   └── ...
├── components/          # React components
│   ├── calendar/        # Calendar view components
│   └── ...
├── db/                  # Database schema & utilities
│   └── schema/          # Drizzle schema files
├── scrapers/            # Cinema scrapers
│   ├── chains/          # Curzon, Picturehouse, Everyman
│   ├── cinemas/         # Individual venues
│   └── utils/           # Shared scraping utilities
├── agents/              # Claude AI agents
├── stores/              # Zustand state stores
└── lib/                 # Utilities & helpers
```

### Scraper Types

1. **Playwright** — For JS-heavy sites (Curzon, BFI, Everyman). Slower but handles dynamic content.
2. **Cheerio** — For static HTML (most independents). Fast.
3. **API-based** — When cinemas expose APIs (Picturehouse). Most reliable.

---

## Data Sources

- **Screening times**: Scraped directly from cinema websites
- **Film metadata**: [TMDB](https://www.themoviedb.org) API
- **Enrichment**: Claude AI for difficult title matching

---

## Contributing

This is a personal project, but PRs are welcome for:
- New cinema scrapers
- Bug fixes
- Performance improvements

Please open an issue first to discuss significant changes.

---

## License

MIT

---

## Acknowledgements

- Film data from [The Movie Database (TMDB)](https://www.themoviedb.org)
- Built with [Next.js](https://nextjs.org), [Drizzle](https://orm.drizzle.team), [Clerk](https://clerk.com)
- Hosted on [Vercel](https://vercel.com)

---

*Built by a cinephile, for cinephiles.*
