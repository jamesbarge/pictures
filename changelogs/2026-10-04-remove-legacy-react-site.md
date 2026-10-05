# Remove the legacy React site from the root Next.js app

**PR**: #787
**Date**: 2026-10-04

## Changes
- Deleted the 16 legacy page routes under `src/app/` (about, cinemas, directors, festivals, film, letterboxd, map, privacy, reachable, seasons, settings, sign-up, terms, this-weekend, tonight, watchlist) plus the root `page.tsx`, `error.tsx`, `global-error.tsx`, `sitemap.ts`, `manifest.ts`, `robots.ts` and the app icons.
- Deleted 82 React components under `src/components/`, every zustand store in `src/stores/`, 7 of the 8 hooks in `src/hooks/`, and the library helpers only those files used: `analytics`, `constants`, `external-urls`, `features`, `geo-utils`, `postcode`, `travel-time`, `url-filters`, `src/lib/sync/` and `src/db/safe-query.ts`, with their tests.
- Deleted the legacy `/api/search` route. Its only callers were two deleted components; pictures.london searches through `/api/films/search` and `/api/search/catalog`.
- Kept for the admin dashboard: `ui/button`, `ui/card`, `ui/badge`, the two Clerk wrappers and `useHydrated`. Their unused exports went (`IconButton`, `CardFooter`, `CardImage`, `CardSkeleton`, `FormatBadge`, `EventBadge`, `RepertoryBadge`, `SafeSignInButton`, `SafeSignedIn`, `SafeSignedOut`).
- `src/app/layout.tsx` shrinks to the four fonts, `globals.css`, the Clerk provider and a `noindex, nofollow` robots tag. It sets `class="dark"` on `<html>`, which is what the deleted `theme-init.js` applied by default, so admin keeps its dark theme.
- `next.config.ts` gains `redirects()`: `/cinemas/:slug/tonight`, `/directors/:id` and `/seasons/:slug` go to the nearest SvelteKit parent, and every other path outside `api/`, `admin`, `sign-in`, `_next/`, `robots.txt`, `favicon.ico` and the Google verification file returns a 308 to the same path on pictures.london. The ISR timeout, `images.remotePatterns`, the `/manifest.json` redirect, the `/ingest` PostHog rewrites and the PostHog, Google Maps and Vercel Insights CSP hosts are removed.
- `public/robots.txt` disallows all crawling of the API host. 14 legacy assets left `public/` (theme and map scripts, template SVGs, PWA icons, OG image); `scripts/generate-favicons.mjs` and `scripts/generate-og-image.mjs` went with them.
- `src/lib/brand.ts` keeps `baseUrl`, the four Clerk colours and the poster placeholder palette. `src/lib/filter-constants.ts` keeps `TimeOfDay`, `ProgrammingType` and `FORMAT_OPTIONS`, and `src/db/schema/user-preferences.ts` imports its two types from there.
- `src/types/` drops the legacy-only `Cinema`, `Film`, `Screening`, `ScreeningWithDetails`, `RawScreening`, `FilmStatus` and related types plus the unused `index.ts` barrel.
- `src/test/setup.ts` keeps the admin allowlist, the server-side Clerk mock and the mock reset. `src/test/utils.tsx` and `src/test/fixtures.ts` are deleted.
- Removed 15 dependencies: `@tanstack/react-query`, `zustand`, `react-day-picker`, `@vis.gl/react-google-maps`, `@base-ui/react`, `@turf/boolean-point-in-polygon`, `posthog-js`, `@vercel/analytics`, `@vercel/speed-insights`, `@types/google.maps`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom`, `@testing-library/jest-dom` and `@playwright/test`. The lockfile loses 57 packages.
- Removed the root Playwright suite (`e2e/`, `playwright.config.ts`, `test:e2e`, `test:e2e:ui`). The required "E2E Tests" CI job keeps its name for branch protection and now runs `npm ci` and `npm run build` on the root app. The "Test Summary" job is gone.
- README, ARCHITECTURE.md, AI_CONTEXT.md and `.env.local.example` describe the API-and-admin app and point UI work at `frontend/`.

## Impact
- api.pictures.london serves the API, admin and Clerk sign-in. Old links and crawler hits on legacy pages land on the matching pictures.london page with a permanent redirect, and the API host stops running per-crawl database queries for the legacy sitemap and pages.
- Every PR now builds the root app in CI, so a bad redirect pattern or a broken admin import fails before Vercel deploys it. The old job skipped itself because `DATABASE_URL_TEST` was never set.
- About 32,700 lines and 190 files leave the repo. The unit suite drops 17 test files (339 tests) that covered only deleted code.
- `/` now redirects to pictures.london, so the `/sign-in` page passes `fallbackRedirectUrl="/admin"` to Clerk's `<SignIn>`. A direct sign-in lands on the admin dashboard; sign-ins started from an admin page still return to that page through Clerk's `redirect_url`.
