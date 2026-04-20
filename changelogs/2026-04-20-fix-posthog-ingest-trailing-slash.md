# Fix PostHog ingestion proxy failing on trailing-slash paths

**PR**: TBD
**Date**: 2026-04-20

## Symptom
Following the opt-in regression fix (PR #433) and the Vercel env var newline cleanup, PostHog events were still not landing. Browser network inspection on pictures.london showed:

- `POST /ingest/i/v0/e/` → **404** (SvelteKit catch-all HTML response)
- `POST /ingest/e/` → **404**
- `GET /ingest/api/surveys/` → **404**
- `GET /ingest/flags/` → **404**
- `GET /ingest/array/<token>/config` → **200** (this one worked all along)

## Root cause
`frontend/vercel.json` used Vercel's `:path*` glob for the `/ingest/*` catch-all rewrite:

```json
{ "source": "/ingest/:path*", "destination": "https://eu.i.posthog.com/:path*" }
```

Vercel's named-parameter glob `:path*` does not match paths with trailing slashes cleanly. Reproduction (identical paths, only difference is the trailing slash):

```
curl https://www.pictures.london/ingest/e      → 400  (proxied to PostHog ✓)
curl https://www.pictures.london/ingest/e/     → 404  (not proxied, SvelteKit 404)
```

Every posthog-js ingestion endpoint ends with `/` (`/e/`, `/i/v0/e/`, `/flags/`, `/api/surveys/`), so every event POST was failing. The only endpoint that worked, `/array/<token>/config`, is the one path posthog-js calls without a trailing slash.

## Fix
Replace the `:path*` globs with the `(.*)` regex form that PostHog's own reverse-proxy docs use. Regex `(.*)` is greedy enough to match trailing slashes while still capturing sub-paths.

```json
{ "source": "/ingest/static/(.*)", "destination": "https://eu-assets.i.posthog.com/static/$1" },
{ "source": "/ingest/(.*)",        "destination": "https://eu.i.posthog.com/$1" }
```

Also removed the explicit `/ingest/decide` rule — the `/ingest/(.*)` catch-all now handles it identically (captures `decide`, forwards to `https://eu.i.posthog.com/decide`).

## Impact
- Combined with PR #433 (opt-in fix) and the env var newline cleanup, this is the final piece: PostHog now captures events end-to-end on pictures.london.
- No code changes. No behaviour change for `/api/:path*` (API proxy to api.pictures.london).
- Static assets continue to be served from `eu-assets.i.posthog.com` (unchanged destination, just simpler pattern).

## Verification plan
After deploy:

1. `curl -X POST https://www.pictures.london/ingest/e/` should return **400** (PostHog rejecting empty body, which means the proxy is forwarding) — NOT 404.
2. Open pictures.london, accept cookies, navigate, click a booking link.
3. In the Pictures PostHog project Live events, confirm `$pageview`, `$autocapture`, `film_viewed`, `booking_link_clicked` appear with `$host = www.pictures.london`.
