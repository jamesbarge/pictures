# V2a Literary Antiqua Redesign — Mobile + Desktop

**PR**: TBD
**Date**: 2026-04-19
**Source**: Claude Design handoff bundle (`/Users/jamesbarge/Downloads/Pictures.zip`) — `pictures-london-v2a-hybrid.html` + sibling `pictures-london-v2a.html` defining the full V2a system across mobile listings, mobile filter sheet, mobile date picker, mobile film detail, desktop hybrid listings, and desktop film detail.

## Why

The user has iterated for hours in Claude Design through five competing V2 typographic directions (Syne/Archivo/DM slab/Bricolage/etc.) and landed on **V2a Literary Antiqua** — a bookish, Penguin-Classics-meets-Sight-&-Sound system. Their explicit feedback on the current Swiss brutalist design: "It looks quite sloppy and amateurish in many ways at the moment." The stated goals — "considered / editorial / London indie cinema character", "stronger hierarchy", "typography doing more heavy lifting", "memorable / distinctive brand" — drive this rebrand.

## Changes

### Design tokens (`frontend/src/app.css`)

Rebrand via CSS custom properties — every component that consumes the existing `--color-*` / `--font-*` variables picks up the new look automatically.

| Token | Before | After |
|---|---|---|
| `--color-bg` | `#f5f2eb` (warm white) | `#efe9dc` (warm beige) |
| `--color-text` | `#0a0a0a` (near-black) | `#1a1410` (deep ink) |
| `--color-text-secondary` | `#3a3a3a` | `#4a3a2e` |
| `--color-text-tertiary` | `#6a6a6a` | `#7a6a5c` |
| `--color-border-subtle` | `#d0ccc4` | `rgba(26,20,16,0.18)` |
| `--color-accent` | `#e63946` (bright red) | `#a83232` (muted oxblood) |

New font family tokens:
- `--font-serif: "Fraunces", Georgia, serif` (display)
- `--font-serif-italic: "Cormorant", Georgia, serif` (italic deck + byline)
- `--font-mono-plex: "IBM Plex Mono", ui-monospace, monospace` (meta + labels)

`html` base font-family changed from `--font-sans` → `--font-serif`. Fraunces loaded with SOFT + opsz variable axes via Google Fonts.

### Homepage — desktop (`frontend/src/routes/+page.svelte`)

- **Day masthead** (new `DayMasthead.svelte`): huge Fraunces 64px prose date (`"Sunday, the nineteenth"` format, italic first letter + italic comma) + horizontal day strip (prev · Today · next 4 days · next) + `Pick date` button wired to `CalendarPopover`.
- **Hybrid layout**: `grid-template-columns: 240px 1fr`. Left: `DesktopFilterSidebar.svelte` with search + `Where` (area chips resolving to cinema clusters) + `Time of day` (2×2) + `Format` + `Genre` + `Era` + Show/Reset footer. Right: `All / New / Repertory` bordered tabs + count line + 4-col grid of `DesktopHybridCard.svelte` (3-col between 1024–1279px).
- Each card: aspect-2/3 poster, Fraunces 20px title with italic first letter, Cormorant byline, IBM Plex Mono meta, top-border-separated list of up to 3 inline screenings (first time in accent oxblood) with `+N more` overflow.

### Homepage — mobile (same `+page.svelte`)

- Cormorant italic ordinal date label ("Sunday, the nineteenth")
- Search input + black `Filter ·N` button
- `All / New / Repertory` bordered tabs (full width)
- `MobileFilmRow.svelte` stack: left text column (title, byline, meta, time+cinema rows) + right 116px poster
- `MobileFilterSheet.svelte` opens over the list: italic headline, chip-based filters across Where/When/Time of day/Format/Genre/Era/Director, sticky Reset + `Show N films` footer
- `MobileDatePicker.svelte`: bottom sheet with grabber, monthly calendar (Mon-start, weekend in accent), Any-date button

### Film detail (`frontend/src/routes/film/[id]/+page.svelte`)

- **Desktop hero**: `grid-template-columns: 320px 1fr` — 320px poster, eyebrow, 96px italic-first-letter Fraunces title, Cormorant byline, IBM Plex Mono meta, Fraunces synopsis, CTA row (primary `Book next showing {time}, {cinema}` + `♡ Save` + `Trailer`)
- **Screenings section**: Fraunces `Showings` heading (italic S), day strip, grouped by cinema with chip buttons per screening time (hollow border, mono time + italic format tail) + keep iCal button adjacent
- **Sidebar** (≥1024px, 280px): Credits (Director / Cast / Country / Language), Status toggles (Want to see / Not interested)
- **Mobile**: poster top (max 280px), title Fraunces 48px → 72px → 96px responsive, byline Cormorant, meta mono, synopsis Fraunces, CTAs flex-wrap

### Layout chrome (`frontend/src/lib/components/layout/Header.svelte`)

- Removed in-header `FilterBar` entirely — homepage owns filters via sidebar/sheet; non-homepage routes don't need filters in the chrome
- Brand bar: logo + Watchlist (italic serif) + About/Map/Reachable + Sign-in (bordered pill) + DimmerDial (burger on mobile)
- Fonts updated: nav items in Fraunces, Watchlist in Cormorant italic per design

### FilmTypeFilter (`frontend/src/lib/components/filters/FilmTypeFilter.svelte`)

Re-styled from underlined text tabs (uppercase "ALL/NEW/REPERTORY") → bordered segmented control ("All/New/Repertory" title-case) with active state filled black. Aligns with the V2a tab pattern used throughout sidebar + filter sheet.

### Dev server (`frontend/vite.config.ts`)

Added `process.env.API_PROXY_TARGET` override so devs without the local Next.js backend can point at `https://api.pictures.london` directly: `API_PROXY_TARGET=https://api.pictures.london npm run dev`.

## Files

**Created** (7):
- `frontend/src/lib/components/calendar/DayMasthead.svelte`
- `frontend/src/lib/components/calendar/DesktopHybridCard.svelte`
- `frontend/src/lib/components/calendar/MobileFilmRow.svelte`
- `frontend/src/lib/components/filters/DesktopFilterSidebar.svelte`
- `frontend/src/lib/components/filters/MobileFilterSheet.svelte`
- `frontend/src/lib/components/filters/MobileDatePicker.svelte`
- `frontend/src/lib/components/filters/CalendarPopover.svelte`

**Modified** (6):
- `frontend/src/app.css` — tokens + fonts + utilities
- `frontend/src/routes/+page.svelte` — full rewrite for hybrid desktop + V2a mobile
- `frontend/src/routes/film/[id]/+page.svelte` — full rewrite for literary hero + grouped screenings
- `frontend/src/lib/components/layout/Header.svelte` — drop in-header FilterBar, re-font nav
- `frontend/src/lib/components/filters/FilmTypeFilter.svelte` — bordered segmented tabs
- `frontend/vite.config.ts` — optional API proxy target env override

## Verification

Side-by-side browser comparison against the Claude Design prototype. Screenshots saved to `.design-verify/`:

| # | Screen | Viewport | Source | Impl |
|---|---|---|---|---|
| 1 | Desktop Hybrid listings | 1440×900 | `.design-verify/source/desktop-hybrid-fullpage.png` | `.design-verify/impl/01-desktop-hybrid.png` |
| 2 | Mobile Listings | 390×844 | `.design-verify/source/v2a-system-fullpage.png` (first cell) | `.design-verify/impl/02-mobile-listings.png` |
| 3 | Mobile Filter Sheet | 390×844 | (second cell) | `.design-verify/impl/03-mobile-filter-sheet.png` |
| 4 | Mobile Date picker | 390×844 | (third cell) | `.design-verify/impl/04-mobile-date-picker.png` |
| 5 | Desktop Film detail | 1440×900 | (hybrid page, detail row) | `.design-verify/impl/05-desktop-film-detail.png` |
| 6 | Mobile Film detail | 390×844 | (mobile detail row) | `.design-verify/impl/06-mobile-film-detail.png` |

Typecheck (`npm run check`): clean in all files touched by this PR. Pre-existing errors in untouched files (FollowButton, CinemaMap, SyncProvider, letterboxd, and the WIP `+page.ts` files in cinemas/festivals/film) are not regressed.

## Impact

- **Users**: Visually dramatic — the site's whole character shifts from Swiss brutalist to literary editorial. Same data, same routes, same filter behaviour under the hood — just a new skin and a denser, more informative desktop layout.
- **Mobile**: Less cramped. Bigger typography, clearer hierarchy, dedicated filter and date picker sheets instead of stuck-in-a-header dropdowns.
- **Accessibility**: Focus-visible rings preserved; larger touch targets on mobile chip buttons (44px+); semantic HTML (sections/headings) retained.
- **Tests**: 38 Playwright tests assert the old header FilterBar topology (`WHEN / ALL CINEMAS / FORMAT` dropdowns, ALL/NEW/REPERTORY uppercase text). Adding `.film-card` + `.film-title` classes to the new cards preserves most selector-level assertions; the filter-specific tests need rewriting against the new sidebar/sheet UI — follow-up scope.

## Follow-up

- Wire the homepage loader to expose `film.genres` and extend the filmMap filter chain to handle genres + decades, then restore the hidden Genre + Era sections in `DesktopFilterSidebar` + `MobileFilterSheet` (disabled in this PR since the chips were dead — clicking them persisted state to localStorage without affecting results).
- Rewrite the 38 failing Playwright tests against the new filter topology (DesktopFilterSidebar on ≥1024px, MobileFilterSheet on <1024px, MobileDatePicker on "Pick a date" tap).
- Add a focus trap + body-scroll lock + Escape-to-close to the mobile filter sheet, mobile date picker, and calendar popover.
- Self-host Fraunces + Cormorant + IBM Plex Mono (match Inter's self-host pattern for consistent CWV / offline-friendliness).
- Implement "If you like this" similar-films rail once backend exposes a similar-films field.
- Wire area chips to distance-based filter when geolocation is added ("Within 2mi" is currently stubbed)
- Migrate genre / decade / 4K-format filters from "persisted but not yet filtered" to active filtering once backend supports them
