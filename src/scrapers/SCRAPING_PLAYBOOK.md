# Scraping Playbook

Operational guide for scraper changes and incident response.

## When To Update This File
Update this playbook whenever you:
- Change selectors or extraction logic in a scraper
- Change date/time parsing behavior
- Add a new scraper command or runner
- Discover a recurring site-specific failure mode

## Shared Rules
- Always capture full time strings including AM/PM context.
- If a time is `1-9` with no AM/PM, default to PM.
- Treat times before `10:00` as likely parse errors and log warnings.
- Use `src/scrapers/utils/date-parser.ts` for shared parsing behavior.
- **Never use `new Date(year, month, day, hours, minutes)` to construct screening datetimes.** That ctor interprets numeric args as the runtime's local timezone, which silently produces +1h offsets during BST when the scraper runs under `TZ=UTC` (cron, CI, container). Always call `ukLocalToUTC(...)` from `utils/date-parser.ts` — it builds UTC explicitly and applies BST. Same goes for `parseUKLocalDateTime()` for ISO-like strings without a timezone suffix.
- After fixing time parsing bugs, verify and clean bad historical screenings (`00:00-09:59`) only when confirmed wrong.

## Primary Entrypoints
- Unified CLI: `src/scrapers/cli.ts` (`npm run scrape -- <slug>`)
- Pipeline orchestration: `src/scrapers/pipeline.ts`
- Base contract: `src/scrapers/base.ts`
- Shared runner helper: `src/scrapers/runner-factory.ts`

## Scraper Families
- Chains (multi-venue): `src/scrapers/chains/`
- Independent cinemas: `src/scrapers/cinemas/`
- Season scraping: `src/scrapers/seasons/`
- BFI PDF import flow: `src/scrapers/bfi-pdf/`

## Change Checklist
1. Confirm extractor output against live source pages.
2. Run targeted scraper command(s) for affected cinemas.
3. Validate saved DB values (not just screening counts).
4. Check times are sensible (mostly `10:00-23:59`).
5. Add/update tests when parser logic changes.
6. Record site-specific notes below.

## Site Note Template
Use this format when recording cinema-specific quirks:

```markdown
### <Cinema Name>
- Source URL pattern:
- Scraper file:
- Date/time format:
- Key selectors:
- Known pitfalls:
- Last verified (YYYY-MM-DD):
```

## High-Impact Sources (Current)
### BFI
- Scrapers: `src/scrapers/cinemas/bfi.ts`, `src/scrapers/bfi-pdf/`
- Notes: Prefer PDF importer path for resilience; monitor `bfi_import_runs` health.

### Picturehouse
- Scraper: `src/scrapers/chains/picturehouse.ts`
- Notes: API-based flow; generally highest reliability.

### Curzon
- Scraper: `src/scrapers/chains/curzon.ts`
- Source URL pattern: `https://www.curzon.com/venues/{slug}/`
- API: `https://digital-api.curzon.com/ocapi/v1/` (Vista OCAPI)
- Auth: JWT embedded in SSR HTML at `window.initialData.api.authToken`
  - Primary extraction: `page.evaluate()` reads the token from the JS context
  - Fallback: request interception on `digital-api.curzon.com` requests
  - Token issuer: `https://auth.moviexchange.com/` (Vista Connect)
- Date/time format: TZ-less ISO 8601 from API (`schedule.startsAt`, e.g. `"2026-05-13T14:15:00"`) — UK local time. Must use `parseUKLocalDateTime()` (NOT `new Date()`).
- Known pitfalls:
  - **Cloudflare protection**: Raw fetch returns 403; requires Playwright with stealth plugin
  - **networkidle never fires**: Curzon SPA loads analytics/chunks indefinitely. Use `domcontentloaded`.
  - **API domain migration (2026-02-22)**: Changed from `vwc.curzon.com` to `digital-api.curzon.com`
  - **Booking URL format change (2026-03-01)**: Moved from path-based to `?sessionId=` query param
  - **Headless detection**: Without stealth plugin + `--disable-blink-features=AutomationControlled`, the Vista SDK does not initialize and no API calls are made
  - **healthCheck**: Cloudflare blocks HEAD to `www.curzon.com`; use API endpoint instead (401 = healthy)
  - **BST timezone (fixed 2026-05-12)**: `schedule.startsAt` is TZ-less. Original `new Date(startsAt)` silently added 1h under `TZ=UTC` during BST. Migrated to `parseUKLocalDateTime`. Duplicate-pair probe confirmed 15 ghost rows existed; cleaned in same change. Same fix class as #484 (Everyman) and #485 (Picturehouse).
- Vista site codes: SOH1, MAY1, BLO1, ALD1, VIC1, HOX1, KIN1, RIC1, WIM01, CAM1
- Last verified (2026-03-18): SSR token extraction working, all venues returning data

### Barbican
- Scraper: `src/scrapers/cinemas/barbican.ts`
- Source URL pattern: `https://www.barbican.org.uk/whats-on/cinema?day=YYYY-MM-DD`
- Approach: Daily cinema listing page (Cheerio, static HTML)
- Date/time format: Times displayed as "12.00pm", "5.55pm" (dot separator, 12-hour with am/pm). Convert dot to colon before feeding to `parseScreeningTime()`.
- Key selectors:
  - `.cinema-listing-card` — film card container
  - `.cinema-listing-card__title a` — film title + event URL (href to `/whats-on/YYYY/event/slug`)
  - `.cinema-instance-list__instance` — individual showtime
  - `a[href*="tickets.barbican"], a[href*="choose-seats"]` — booking link (text is the time)
  - Sold out: no booking link; `<span>` contains "X.XXpm (Sold out)"
- Known pitfalls:
  - **BST timezone**: Displayed times are UK local. Must use `ukLocalToUTC()` to convert.
  - **Sold-out screenings**: Have no `<a>` tag, only a `<span>` with "(Sold out)" appended to the time.
  - **Coverage**: The `/whats-on/cinema?day=` page covers ALL cinema series (New Releases, Cold War Visions, Relaxed Screenings, London Soundtrack Festival, etc.). The old `/whats-on/series/new-releases` page only covered one series.
  - **Day range**: The nav shows ~7 days but the `?day=` parameter accepts any future date. We scrape 14 days ahead.
  - **Old performances endpoint**: The `/whats-on/event/{nodeId}/performances` page still works but its `datetime` attribute has a misleading `Z` suffix — the values are actually UK local time, not UTC. The old scraper used `new Date(attr)` which was off by 1 hour during BST.
- Last verified (2026-04-10): Rewrote to use daily listing approach. 9 screenings parsed from April 10 test page, matching website exactly.

### Castle Cinema (Hackney) and Castle Sidcup
- Scrapers: `src/scrapers/cinemas/castle.ts`, `src/scrapers/cinemas/castle-sidcup.ts`
- Shared parser: `src/scrapers/cinemas/castle-calendar.ts`
- Source URL pattern: `<baseUrl>/calendar/` (Hackney: `https://thecastlecinema.com/calendar/`, Sidcup: `https://castlesidcup.com/calendar/`)
- Approach: One static HTML fetch per venue. Parse `.performance-button` elements (one per screening) and resolve film title from the most recent preceding `<h1>` in document order, scoped to the calendar block.
- Key selectors / attributes:
  - `<h3 class="date">Wed, 6 May</h3>` — day section heading. The first `<h3 class="date">` anchors the calendar block; any `<h1>` before it (page chrome, header) is ignored.
  - `<h1>Film Title</h1>` — film card title heading inside the calendar block
  - `<a class="performance-button" data-perf-id="…" data-start-time="2026-05-06T16:00:00" href="/bookings/…/">` — one per screening. Attribute order is fixed in the Wagtail template.
- Date/time format: `data-start-time` is UK local time with no timezone suffix. Use `parseUKLocalDateTime()` to handle BST correctly.
- sourceId format: `castle-{perfId}` for Hackney, `castle-sidcup-{perfId}` for Sidcup.
- Known pitfalls:
  - **Homepage JSON-LD only surfaces ~7 days of programming.** The previous (pre-2026-05-06) scrapers used homepage JSON-LD and missed ~89 screenings combined. Always use `/calendar/`.
  - **Document-order title resolution is sensitive to in-calendar `<h1>` tags.** The parser scopes `<h1>` collection to the calendar block (everything after the first `<h3 class="date">`), so page-chrome `<h1>` tags can't bleed in. Any *new* `<h1>` introduced inside the calendar — e.g. a per-section banner — would be picked up as a film title and mis-attribute screenings.
  - **Attribute-order coupling**: the structured regex requires `class → data-perf-id → data-start-time → href`. The parser detects template drift (any `class="performance-button"` opening tag with zero structured matches) and throws a hard error rather than returning empty silently.
  - **HTML entities** in titles (`&apos;`, `&amp;`, `&ndash;`, `&#8217;` etc.) are decoded inline by the parser; the downstream `cleanFilmTitleWithMetadata` handles further normalization.
  - **Nested tags inside `<h1>`** (e.g. `<h1>Title <em>part</em></h1>`) would break the `[^<]+` capture. Not seen in current templates; if it appears, switch to a tag-tolerant capture.
- Last verified (2026-05-06): Castle Hackney 91 screenings (23 distinct dates through 2026-10-22), Castle Sidcup 132 screenings (17 distinct dates through 2026-06-25).

### Everyman
- Scraper: `src/scrapers/chains/everyman.ts`
- Notes: Playwright-heavy; more sensitive to markup and client-side app changes.
