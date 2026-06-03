# SEO — dynamic sitemap.xml + robots Sitemap directive

**PR**: TBD
**Date**: 2026-06-01

## Changes
- Added `frontend/src/routes/sitemap.xml/+server.ts` — the first sitemap pictures.london has ever had.
  SSR endpoint (SvelteKit `+server.ts`, `prerender = false`) that SSR-fetches the prod API via
  `$lib/server/api` and emits a sitemaps.org `<urlset>` with ~995 URLs:
  - 13 static public routes (home, /tonight, /this-weekend, /cinemas, /festivals, /directors,
    /reachable, /map, /search, /letterboxd, /about, /privacy, /terms) with tuned priority/changefreq.
  - 64 cinema pages (`/cinemas/{id}` from `/api/cinemas`).
  - 17 festival pages (`/festivals/{slug}` from `/api/festivals`).
  - 701 people pages (`/people/{name}` from `/api/directors?days=60`).
  - Films (`/film/{uuid}`): prefers `/api/films/sitemap` (full enumerator, ~1,066 — not yet deployed)
    and falls back to the top-200 `/api/films/search?browse=true` payload until that endpoint lands.
- Added a `Sitemap: https://pictures.london/sitemap.xml` directive to `frontend/static/robots.txt`.

## Design notes
- **Resilience**: every upstream fetch is wrapped in a `safe()` helper that degrades to an empty list, so
  one failing API call can't 500 the whole sitemap — worst case it still returns the 13 static entries.
- **Forward-compatibility**: the film source tries the full enumerator first, so the sitemap auto-upgrades
  from 200 → ~1,066 film URLs the moment `/api/films/sitemap` is deployed — no further frontend change.
- **Host = apex** (`https://pictures.london`) to match every `<link rel="canonical">` the app emits
  (`$lib/seo/json-ld.ts`, `+layout.svelte`, `/people/[name]`). Null id/slug/name keys are filtered to
  avoid emitting `/people/undefined`-style dead URLs.
- **Caching**: `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=604800` — hard
  CDN cache + background revalidation; crawlers get a fast cached doc, content refreshes daily.

## Verification
- `npx svelte-check` → 0 errors.
- Live dev render (`npm run dev` → `curl localhost:5173/sitemap.xml`): HTTP 200, well-formed XML (parsed),
  995 URLs (64 cinemas / 17 festivals / 701 people / 200 films / 13 static).
- Sampled one URL of each class against prod → all HTTP 200.
- Code-reviewed (Code Reviewer agent): host-mismatch (HIGH) fixed; resilience/escaping/fallback confirmed.

## Impact
- **SEO / discoverability**: gives Google/Bing a complete, prioritized map of the site's indexable
  surface — previously there was none, so crawl coverage of cinema/festival/people/film long-tail pages
  relied entirely on internal linking. Frontend-only → auto-deploys on merge (no backend promote needed).

## Follow-ups
- Deploy a tiny read-only `GET /api/films/sitemap` enumerator (rides the next backend promote) to lift
  film coverage from 200 → ~1,066.
- The site serves on `www.pictures.london` but declares canonical `pictures.london` and 307-redirects
  apex→www — a circular signal. Recommend a `www→apex` 308 in Vercel domain config so the canonical host
  is also the served host (eliminates the sitemap's one-hop redirect).
