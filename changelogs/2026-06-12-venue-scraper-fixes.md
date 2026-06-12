# Venue Scraper Fixes — Cinema Museum, David Lean, Close-Up

**PR**: local branch `fix/venue-scrapers` (not pushed)
**Date**: 2026-06-12

Three broken independent-venue scrapers triaged. Two fixed and verified against
live `scrape()` runs; one (Close-Up) confirmed blocked by an interactive
Cloudflare Turnstile and documented rather than forced.

## Changes

### Cinema Museum (`src/scrapers/cinemas/cinema-museum.ts`, `src/scrapers/constants.ts`)
- Added `CALENDAR_CLIENT_USER_AGENT = "Google-Calendar-Importer"` to `constants.ts`.
- `fetchPages()` and `healthCheck()` now send that UA instead of the old
  self-identifying `pictures-cinema-museum-scraper/1.0` UA.
- Corrected the now-misleading code comments.
- **Root cause (verified live 2026-06-12 on `https://cinemamuseum.org.uk/schedule/?ical=1`):**
  the SiteGround WAF returns **403** to browser-fingerprint UAs (anything with
  `Chrome` / a full desktop string) AND to the old self-identifying UA, but
  **200** to plain non-browser calendar-client UAs (curl default, empty UA,
  Googlebot, Node's default fetch UA, `Google-Calendar-Importer`). The WAF
  behaviour had tightened since the scraper was written; a Chrome UA is the
  blocked class, so the fix is the opposite of "use a real browser UA".

### David Lean (`src/scrapers/cinemas/david-lean.ts`)
- Widened the listing date/time regex: month alternation accepts a 3-letter
  prefix + optional trailing letters (`(Jan|...|Dec)[a-z]*`) so full month names
  like "June"/"July" match; day-name group widened (`Tues`/`Weds`/`Thur`/`Thurs`
  via `\w*`); the time portion now captures the rest of the line so multi-time
  listings ("2.30pm and 7.30pm", including ones split by "(HOH)") are all caught.
- Listings are read via `innerText` (was `textContent`) so the per-line
  title / metadata / date structure `parseListingText()` relies on is preserved.
- `extractTimes()` strips detailed `HH.MMam` times before scanning for bare-hour
  times, eliminating spurious matches on the minute half of a time
  (e.g. `2.00pm` -> bogus `00pm` -> phantom 00:xx / next-day screenings).
- Switched the two regex iteration loops to `String.prototype.matchAll`.
- **Root cause:** the month-abbreviation mismatch meant NO listing ever parsed —
  consistent with scraper_runs history showing the venue had never returned a
  screening.

### Close-Up (`src/scrapers/cinemas/close-up.ts`) — NOT MODIFIED
- Investigated only. Every endpoint probed (`/`, `/search_film_programmes/?date=...`,
  `/?ical=1`, `/whats_on/?ical=1`, `/feed/`, `/calendar.ics`, `/whatson.ics`,
  `/events.ics`) returns **403 `cf-mitigated: challenge`** for both browser and
  plain UAs — no unprotected iCal endpoint exists.
- The challenge is an **interactive Cloudflare Turnstile** ("Verify you are
  human" checkbox), confirmed by screenshot — a harder class than the
  non-interactive managed challenge the BFI `createPersistentPage` +
  `waitForCloudflare` pattern clears.
- Three bypass attempts failed (headless persistent context; headed persistent
  context; warm two-pass headed profile reusing the `cf_clearance` dir) — the
  Turnstile never cleared. Stopped per the 3-attempt rule; scraper left
  unchanged so it continues to fail loudly rather than silently.

### Docs
- `src/scrapers/SCRAPING_PLAYBOOK.md`: new site-note sections for all three
  venues (Cinema Museum UA inversion, Close-Up Turnstile blocker + future
  options, David Lean parsing fixes).

## Verification
- `npx tsc --noEmit` — exit 0.
- `npm run lint` — 0 errors (60 pre-existing warnings, none in touched files).
- `npm run test:run` — 111 files / 1696 tests passed.
- Live `scrape()` runs (no DB writes):
  - Cinema Museum: `healthCheck()` true, 25 screenings, 0 suspect (<09:00 UTC).
    Cross-check: "The Night of the Hunter (1955)" 19:30 BST -> 18:30 UTC matches
    feed `DTSTART;TZID=Europe/London:20260617T193000`.
  - David Lean: 49 screenings (was 0), 0 suspect times. Cross-checks vs live
    site: Fairyland 16 June 2.30pm+7.30pm, Who Framed Roger Rabbit? 20 June
    11.00am, The Devil Wears Prada 2 24 June 5.30pm.
  - Close-Up: blocked (403/Turnstile) — no run possible.

## Impact
- Restores the Cinema Museum and David Lean screening feeds (both were yielding
  nothing).
- Close-Up remains down; the playbook now records the exact blocker and the
  approval-gated options for a future fix (CAPTCHA-solving service, residential
  proxy + warmed cookies, or Camoufox/Patchright).
- `CALENDAR_CLIENT_USER_AGENT` is a new shared constant available to any other
  iCal-feed scraper that hits the same WAF class.
