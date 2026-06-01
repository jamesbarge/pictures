# Frontend — Spline neo-brutalist redesign (Figma 2070:669)

**PR**: TBD
**Date**: 2026-05-17
**Branch**: `feat/figma-spline-redesign`
**Figma**: https://www.figma.com/design/X1XgglFJsFB6qQ9cwlYjVo/My-Projects?node-id=2070-669

## Why

Visual reset of `pictures.london` toward the Figma neo-brutalist direction (file `X1XgglFJsFB6qQ9cwlYjVo`, node `2070:669`): white card on warm beige chrome, Spline Sans across the system, hard-offset shadows on filter chips, cream `#eae5c2` accent on pure black. Replaces the V2a Literary Antiqua direction (Fraunces serif + oxblood) introduced earlier.

## Scope decision

Three-way decision matrix surfaced before any code changed:
1. **System swap (chosen)** — `app.css` tokens rewritten so every page inherits Spline Sans, black-on-cream palette, new radii. Maximum visual coherence; other pages get the new look "for free" without bespoke rebuilds.
2. **Mobile translation (chosen)** — Figma only shows desktop, so mobile breakpoints are designer's-best-judgement: card goes full-width, toolbar wraps 2-up, poster stays in the left column with the 64px right rail intact.
3. **Spline Sans self-hosted (chosen)** — matches the existing `/fonts/*.woff2` pattern. Variable font, latin + latin-ext (~78KB combined).

## Changes

### Tokens (`frontend/src/app.css`)
- New `@font-face` for `Spline Sans` (300–700 variable, two unicode-range files: latin + latin-ext)
- All `--font-*` family vars repointed to Spline Sans (legacy aliases like `--font-serif`, `--font-mono-plex` kept so unmigrated callers still resolve)
- `--color-text` → `#000000`, `--color-screening-bg/text` → black/cream, `--color-accent` collapsed to black (oxblood gone)
- New `--color-cream: #eae5c2` for chip icon tiles + active-tab text
- Radii: `--radius-sm/md: 4px`, `--radius-lg/xl: 16px`, `--radius-2xl: 42px` (was all-zero)
- New `--shadow-brutalist: 4px 4px 0 0 #000` and a `-sm` 2px variant
- Type scale rebased to match Figma sizing (10/12/14/16/20/24/32px ladder)
- Legacy V2a font-axis helpers (`.soft-display-*`) neutered to `font-variation-settings: normal` since Spline Sans has no SOFT/opsz axes
- Dark theme mirrored — cream becomes the page text, black the bg

### New components
- **`frontend/src/lib/components/calendar/FigmaFilmCard.svelte`** — 328px-wide card (264px poster + 64px right rail). Rail stacks year (14px bold), director (10px bold, one word per line up to 4), and format chips (35MM/4K etc., deduped from screening list, light weight). Title row centred bold 24px caps. Screening rows 30px tall, 64px time gutter + cinema. Rotated MORE rail (black, cream text) appears only when `overflow > 0`.
- **`frontend/src/lib/components/filters/FigmaToolbar.svelte`** — bridges the new toolbar UI to the existing `filters` store. Reads `programmingTypes` for the ALL/NEW/REPERTORY active state, reads `dateFrom` / `cinemaIds` / `formats` / `filmSearch` to dynamically relabel the WHEN/WHERE/HOW/SEARCH chips. POSTERS/TEXT toggle is local state for now (no display-mode store yet). Chips invoke `onOpenFilters` callback — currently wired to open `MobileFilterSheet` on both desktop and mobile.

### Homepage rewrite (`frontend/src/routes/+page.svelte`)
- Old desktop/mobile shells (sidebar + table + hybrid card) collapsed into a single responsive outer card
- White rounded-42 `.card-outer` with 20/16/24px padding ladder
- `.day` sections get 16px radius + black 12-padded header bar
- `.film-row` is `flex-wrap` with `margin-left: -1px` between cards so adjacent borders overlap (1px lines between cards, not 2px)
- Day label compresses to `TODAY` / `TOMORROW` / weekday-day-month for future dates
- Filter logic (`filmMap`, `dayGroups`, `visibleDayGroups`) preserved verbatim — only rendering changed

### Other pages
Untouched. `/tonight`, `/this-weekend`, `/festivals/[slug]` still import `DesktopHybridCard` / `MobileFilmRow`; they inherit the new fonts, colors and radii from `app.css` but keep their existing layouts. `FilterBar` and the individual picker components also untouched.

## Verification

- `npm run check` — 13 errors and 2 warnings, all pre-existing (env-var bindings, letterboxd page, FollowButton/SyncProvider null checks). Zero new diagnostics in the touched files.
- Dev server (`npm run dev` on :5174) — desktop screenshot at 1440×1024 confirms 4 cards per row, toolbar chips render with cream icon tiles and 4px hard-offset shadow, day header bar has cream text on black. Mobile screenshot at iPhone 12 Pro confirms toolbar wraps 2-up and the card becomes full-width.
- Other pages spot-checked at 1440 (`/tonight`, `/this-weekend`, `/about`, `/map`) — all return 200, render with new tokens, no broken layout.

## Impact

- **Users**: homepage gets the new neo-brutalist look immediately; all other pages get the font + palette swap but keep their existing layouts. Filter functionality unchanged — same store, same data, same routing.

### Follow-ups worth deciding before shipping
1. Header brand: the existing sticky `Header.svelte` still renders `BreathingGrid` + nav above the card, so the homepage now shows two brand marks. Options: drop the in-header brand on `/`, or replace `BreathingGrid` with the same wordmark site-wide.
2. Other pages (`/tonight`, `/this-weekend`, `/about`, `/map`) inherit the new tokens but keep their old layouts — they look coherent but don't yet use the white-card container or new chips. Migrating them is a follow-up PR.

## Second pass — interactive toolbar fixes

The first pass left the toolbar visually correct but interactively broken in two ways. Both fixed in this branch:

### Hydration failure (the real blocker)
Client-side JS was throwing during init: `import { PUBLIC_POSTHOG_KEY } from '$env/static/public'` failed because the variable didn't exist in any env file. SvelteKit's `$env/static/public` compiles to a module that only exports vars present at build time. Missing → SyntaxError on module load → Svelte never finished hydration → every button on the page was a dead pixel. The bug pre-dated the redesign — it would have killed clicks anywhere using a store/handler — but only became user-visible once the entire toolbar moved to client interactivity.

Fix: added empty placeholders to `frontend/.env.local` for `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`, `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. The runtime code already guards (`if (!PUBLIC_POSTHOG_KEY) return;`, `clerkEnabled = ... && !key.includes('your_')`), so empty values just disable analytics + auth in local dev. Documented in `.env.example`.

### Chip popovers + working POSTERS/TEXT toggle
`FigmaToolbar` rewritten — chips now use the existing `Dropdown` primitive to anchor inline popovers below themselves (one open at a time, click-outside closes):

- **WHEN** — 4 preset buttons (TODAY / TOMORROW / WEEKEND / PICK A DATE…) + time-of-day grid (MORNING / AFTERNOON / EVENING / LATE) bound to `filters.dateFrom` / `dateTo` / `timeFrom` / `timeTo`. PICK A DATE swaps the panel for the existing `CalendarPopover` component.
- **SEARCH** — single text input bound two-way to `filters.filmSearch`, Enter closes the popover.
- **WHERE** — search box + cinema list grouped by area, `Checkbox` primitives bound via `filters.toggleCinema`.
- **HOW** — `FORMAT_OPTIONS` mapped to `Checkbox` primitives bound via `filters.toggleFormat`.
- Each chip label updates live from the filter state (chip shows e.g. `TODAY`, `CURZON ALDGATE`, `35MM`, `2 CINEMAS`).
- A `CLEAR` button appears in each panel when that dimension has active filters.

**POSTERS / TEXT** is now a real display-mode switch. Local `displayMode: 'posters' | 'text'` state in `+page.svelte` is passed into `FigmaToolbar` and back via `onDisplayModeChange`. New component `FigmaTextDay.svelte` renders a dense one-row-per-screening table with columns `TIME · TITLE · DIRECTOR · YEAR · FORMAT · CINEMA`, cream header row, hover-cream rows, responsive column hiding (DIRECTOR hides <1024px, YEAR + FORMAT hide <640px). Verified end-to-end: 279 rows render correctly with no filters applied; each row is a real `<a>` that links to the cinema's booking page (or film detail as fallback) and fires `trackScreeningClick`.

### Dev-env files
- `frontend/vite.config.ts` — functional `defineConfig` + `loadEnv()` so `.env.local` is read at config time (raw `process.env` doesn't see it)
- `frontend/.env.local` — `API_PROXY_TARGET=https://api.pictures.london` (gitignored, local-only)
- `frontend/.env.example` — documents `API_PROXY_TARGET` and the analytics/auth env vars that must exist (even empty) for `$env/static/public` to compile
- **Designers**: the in-card wordmark (`PICTURES.LONDON` at 32px) now lives inside the homepage. The existing `Header` chrome (BreathingGrid logo + nav) is unchanged and sits above the card — visually two brand marks on the homepage. Worth a follow-up to decide whether to remove the header brand on `/`.
- **Engineering**: `app.css` is now the source of truth for the new tokens — any future page migrating to the design just needs to swap layout, not redefine tokens. `FigmaToolbar`'s POSTERS/TEXT toggle is local state — when the design wants this to actually switch view modes, a new `displayMode` store should be added to `filters.svelte.ts`.

## Dev-environment fix bundled in

While testing card clicks I hit a 404 on every `/film/[id]` page in local dev. Root cause was pre-existing: the universal `+page.ts` uses client-side `apiGet` with relative `/api/*` paths, which go through the Vite proxy at `process.env.API_PROXY_TARGET ?? 'http://localhost:3000'`. Without a local Next.js backend on :3000, the proxy connection fails and the `try/catch` in `+page.ts` converts every network error into a 404. Same trap for anyone trying to dev the frontend without spinning up the backend.

Fix:
- `frontend/vite.config.ts` — switched to functional `defineConfig` form and used `loadEnv()` so `.env.local` is picked up at config time (raw `process.env` doesn't see it otherwise).
- `frontend/.env.local` — new, sets `API_PROXY_TARGET=https://api.pictures.london` so `npm run dev` "just works" for frontend-only changes. Gitignored as per `.env.*` rule, so this only lives on this machine.
- `frontend/.env.example` — added the `API_PROXY_TARGET` line with a comment explaining the prod vs. localhost trade-off.

## Files

- `frontend/src/app.css` — rewritten
- `frontend/src/routes/+page.svelte` — rewritten
- `frontend/src/lib/components/calendar/FigmaFilmCard.svelte` — new
- `frontend/src/lib/components/filters/FigmaToolbar.svelte` — new
- `frontend/static/fonts/SplineSans.woff2` — new (57KB latin)
- `frontend/static/fonts/SplineSans-ext.woff2` — new (21KB latin-ext)
- `frontend/vite.config.ts` — `loadEnv` so `.env.local` is honoured for proxy target
- `frontend/.env.example` — documents `API_PROXY_TARGET`
- `frontend/.env.local` — local-only, points proxy at prod (gitignored)
- `RECENT_CHANGES.md` — top entry added
- `changelogs/2026-05-17-spline-redesign.md` — this file
