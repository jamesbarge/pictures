# Repoint the misdirected InterVariable preload in app.html to Cormorant-Italic (+3 related fonts fixes)

**PR**: perf campaign
**Date**: 2026-05-29

## Changes
- **Repoint font preload** (`app.html` line 11): changed the high-priority `preload` from `/fonts/InterVariable.woff2` (352,240 B, never painted above the fold — only Chip.svelte after a filter and the FittedTitleCanvas fallback consume Inter) to `/fonts/Cormorant-Italic.woff2` (38,140 B, `--font-serif-italic`, painted on first load in the Header watchlist link and the homepage masthead/day headers). Inter still loads on demand via its retained `@font-face` (`font-display:swap`). Fraunces and IBMPlexMono preloads untouched.
- **Drop `crossorigin` from the image.tmdb.org preconnect** (line 7): browsers key sockets by `(origin, CORS-mode)`. Every critical-path poster `<img>` (DesktopHybridCard, MobileFilmRow, FilmCard, the film-detail hero, the home LCP `preload as=image`) loads in NON-CORS mode, so the CORS-warmed socket could never be reused. The preconnect now matches the real non-CORS poster requests; the hover-only CORS canvas (FittedTitleCanvas) opens its own connection regardless. `dns-prefetch` left intact.
- **Remove the dead `api.pictures.london` preconnect + dns-prefetch** (former lines 9-10): the browser never contacts that origin — the client API helper fetches relative `/api/*` paths that `vercel.json` rewrites server-side; the literal host only appears in SSR (`src/lib/server/api.ts`). The hint wasted a concurrent-connection slot and a DNS+TLS handshake every page load.
- **Add `clerk.pictures.london` preconnect (crossorigin) + dns-prefetch** (in place of the removed api hints): in production the publishable key decodes to `clerk.pictures.london` and `ClerkProvider` renders unconditionally, so ClerkJS bootstraps its bundle + `/v1/client` on every production page. `crossorigin` is kept because ClerkJS fetches with CORS credentials, matching the warmed socket. In dev/non-clerk builds the hint is a harmless no-op.

## Impact
- **Who/what**: every visitor to pictures.london (all routes share `app.html`).
- **Metrics moved**:
  - LCP / critical-path font bytes: removes a 352 KB non-visible high-priority preload from the queue and promotes the 38 KB Cormorant-Italic face to kill above-the-fold FOUT on the masthead + Header watchlist link.
  - LCP poster: removes one DNS+TLS round-trip (~100-300 ms on cold mobile) from the critical TMDB poster request by making the warmed socket reusable.
  - TTFB/contention: frees a concurrent-connection slot by dropping the unused api.pictures.london handshake, letting tmdb/clerk connections open sooner.
  - Hydration/auth-ready: saves one DNS+TLS round-trip (~100-300 ms cold) on the Clerk frontend-API connection bootstrapped on every production page.

## Behavior preservation
Rendered DOM, layout, and computed styles are byte-identical — only resource-hint `<link>` attributes/targets changed (no element produces visible output); acceptance: Playwright on `/` at 390×844 and 1280px confirms Cormorant-Italic is fetched early high-priority while InterVariable is NOT fetched on initial load (loads on demand when a Chip renders after a filter), exactly one non-CORS socket opens to image.tmdb.org and is reused by the LCP poster, no browser connection is ever opened to api.pictures.london, the Clerk socket warms during HTML parse, and pixel-diffs of the masthead + Header + film detail are identical after fonts settle.
