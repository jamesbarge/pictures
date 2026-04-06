# Frontend Rules (SvelteKit)

## Architecture
- Frontend lives in `frontend/` — separate from the Next.js backend at root
- SvelteKit 2 with Svelte 5 runes, deployed to Vercel from `frontend/`
- Consumes the Next.js API via rewrites (`/api/*` → `api.pictures.london`)
- Swiss International Typographic Style — zero border-radius, high contrast

## Svelte 5 Runes
- Use `$state`, `$derived`, `$derived.by`, `$effect` — no legacy `writable`/`readable` stores
- Stores live in `frontend/src/lib/stores/*.svelte.ts`
- Use `$props()` for component props, `$derived` for computed values
- Guard browser-only code with `import { browser } from '$app/environment'`

## File Structure
- Routes: `frontend/src/routes/` (SvelteKit conventions: `+page.svelte`, `+page.ts`, `+layout.svelte`)
- Components: `frontend/src/lib/components/` organized by feature (calendar, filters, reachable, film, ui, layout, map, festivals, pretext)
- Stores: `frontend/src/lib/stores/` (filters, preferences, film-status, reachable, sync)
- API client: `frontend/src/lib/api/client.ts` (apiGet, apiPost, apiPut, apiDelete)
- Analytics: `frontend/src/lib/analytics/posthog.ts` + PostHogProvider.svelte
- SEO: `frontend/src/lib/seo/json-ld.ts` + JsonLd.svelte
- Types: `frontend/src/lib/types/` (film, cinema, screening)

## Design System
- Tailwind CSS 4 with custom theme in `frontend/src/app.css`
- Colors via CSS custom properties: `var(--color-text)`, `var(--color-muted)`, `var(--color-surface)`, `var(--color-screening-bg)`
- Fonts: Inter (sans), Space Grotesk (display), JetBrains Mono (mono)
- Uppercase headings with `tracking-wide-swiss` or `tracking-swiss`
- Zero border-radius everywhere (Swiss brutalist)
- Light/dark mode via `data-theme` attribute

## Auth (Clerk)
- svelte-clerk with conditional ClerkProvider (graceful degradation when unconfigured)
- `hooks.server.ts` skips Clerk for `/api/` routes and catches handshake failures
- Auth state: `useClerkContext()` inside ClerkProvider only
- Env vars: `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

## Analytics (PostHog)
- Init in PostHogProvider.svelte (mounted in root layout)
- Event helpers in `posthog.ts`: trackFilmView, trackSearch, trackBookingClick, etc.
- Pageview tracking via `$effect` watching `$page.url.pathname`
- Env vars: `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`

## Testing
- Playwright E2E tests: `frontend/test-all.spec.ts` (desktop) + `frontend/tests/mobile.spec.ts` (iPhone 12 Pro)
- Run: `cd frontend && npx playwright test`
- Tests use production API proxy — need dev server running
- Mobile tests use `devices['iPhone 12 Pro']` (390x844)

## Mobile
- Filter bar: search on top, ALL/NEW/REPERTORY + FILTERS toggle on mobile
- Dropdowns: `position: fixed` on mobile with `top: 49px`
- DimmerDial hidden below 768px
- Touch targets: minimum 44px (2.75rem)
- No horizontal scroll — use `overflow-x: hidden` on html

## Key Patterns
- Film status: localStorage-backed with server sync when signed in (`setStatus` pushes, `setStatusLocal` doesn't)
- API errors: catch and return empty data with console.error (pages show empty state)
- London timezone: use `Intl.DateTimeFormat` with `timeZone: 'Europe/London'` for all date calculations
- BST handling: detect UTC offset via `shortOffset` format part
