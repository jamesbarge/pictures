# Cinema Scraper Playbook

This document describes how each cinema website is scraped, including the approach, selectors, and date formats used. Refer to this when debugging or modifying scrapers.

## Quick Reference Table

| Cinema | Method | Browser? | Key URL Pattern | Status |
|--------|--------|----------|-----------------|--------|
| **BFI Southbank** | Calendar clicks | Playwright | `whatson.bfi.org.uk/Online/default.asp` | Working |
| **BFI IMAX** | Calendar clicks | Playwright | `whatson.bfi.org.uk/imax/Online/default.asp` | Working |
| **Curzon** | Date tabs | Playwright | `/venues/{slug}/` | Working |
| **Picturehouse** | API POST | No | `/api/scheduled-movies-ajax` | Working |
| **Prince Charles** | Single page | No | `/whats-on/` | Needs testing |
| **ICA** | Multi-page | No | `/films` + `/films/{slug}` | Working |
| **Barbican** | 3-step | No | `/whats-on/series/new-releases` | Working |
| **Rio** | Embedded JSON | No | Homepage `var Events` | Working |
| **Genesis** | Multi-page | No | `/whats-on/` + `/event/{slug}` | Working |
| **Peckhamplex** | Multi-page | No | `/film/{slug}` | Working |
| **Nickel** | page.evaluate | Playwright | `book.thenickel.co.uk` | Working |
| **Everyman** | Date tabs | Playwright | `/venues-list/{code}-everyman-{slug}/` | Working |
| **Lexi** | Single page | Playwright | `/TheLexiCinema.dll/Home` | Broken |

---

## Detailed Scraper Documentation

### 1. BFI Southbank & IMAX

**File:** `src/scrapers/cinemas/bfi.ts`

**Approach:**
- Uses Playwright with stealth plugin to bypass Cloudflare protection
- Navigates to calendar page, clicks date cells to load results
- Selector for dates: `[role="gridcell"]:not([aria-disabled="true"])`
- Selector for films: `$('a[href*="loadArticle"]')`

**Date Format:** `"Friday 19 December 2025 14:30"`

**Key URLs:**
- Southbank: `https://whatson.bfi.org.uk/Online/default.asp`
- IMAX: `https://whatson.bfi.org.uk/imax/Online/default.asp`

**Important Notes:**
- Cloudflare challenge takes 45+ seconds to clear
- Page has no `<main>` element - search for `loadArticle` links directly
- Datetime found in grandparent element text, not siblings
- Screen info: NFT1-4, IMAX, Studio

---

### 2. Curzon

**File:** `src/scrapers/chains/curzon.ts`

**Approach:**
- Playwright for JS rendering
- Navigate to venue page, scrape first date (already loaded)
- Then click date buttons 1+ for additional days
- Up to 14 days of listings

**Date Format:** `"Mon 22 Dec"` + `"12:00PM"`

**Time Format Note:** Time is in split elements: `<a><time>2:15</time>PM</a>`
- Must use `$time.text()` (full link text), NOT `$time.find('time').text()`
- The `<time>` element only contains "2:15", the "PM" is separate text

**Key Selector:** `[class*="date-picker"] button, [role="listitem"] button`

**Venue Slugs:** soho, mayfair, bloomsbury, aldgate, victoria, hoxton, kingston, richmond, wimbledon, camden

**Important Notes:**
- First date button is already active/selected - don't click it
- Scrape current page first, then click subsequent dates
- Time parsing: use full text of link element to capture AM/PM suffix

---

### 3. Picturehouse

**File:** `src/scrapers/chains/picturehouse.ts`

**Approach:**
- Direct API POST to `/api/scheduled-movies-ajax` - **no browser needed**
- Fastest scraper (~1,900 screenings from 11 venues)

**Date Format:** ISO: `"2025-12-21T18:30:00"`

**API Endpoint:** `https://www.picturehouses.com/api/scheduled-movies-ajax`

**Cinema IDs:**
```
central: 10101, east_dulwich: 10082, hackney: 10069
ritzy: 10070, gate: 10103, greenwich: 10104
clapham: 10098, crouch_end: 10105, finsbury_park: 10106
west_norwood: 10099, ealing: 10107
```

---

### 4. Prince Charles Cinema

**File:** `src/scrapers/cinemas/pcc.ts`

**Approach:**
- Single page fetch to `/whats-on/`
- No browser needed
- Parses performance lists

**Date Format:** `"Friday 19th December"` + `"14:30"`

---

### 5. ICA

**File:** `src/scrapers/cinemas/ica.ts`

**Approach:**
- Fetch films listing page, then each film detail page
- Max 50 films processed

**Date Format:** `"Fri, 19 Dec 2025"` + `"04:15 pm"`

---

### 6. Barbican

**File:** `src/scrapers/cinemas/barbican.ts`

**Approach:**
- 3-step: Listing page -> Film detail page -> Performances API endpoint
- Uses node ID from film page to call performances API

**Date Format:** ISO datetime attribute

---

### 7. Rio Cinema

**File:** `src/scrapers/cinemas/rio.ts`

**Approach:**
- Extracts `var Events = {...}` embedded JSON from homepage
- Custom bracket-matching JSON parser
- Most efficient approach - single page fetch

**Date Format:** `"2025-12-19"` + `"1800"` (HHMM)

---

### 8. Genesis Cinema

**File:** `src/scrapers/cinemas/genesis.ts`

**Approach:**
- Fetch `/whats-on/` listing page
- Then fetch each `/event/{slug}` detail page

**Date Format:** `"Friday 20 December"`

---

### 9. Peckhamplex

**File:** `src/scrapers/cinemas/peckhamplex.ts`

**Approach:**
- Fetch films listing, then each `/film/{slug}` detail page

**Date Format:** `"20 Dec 14:30"`

---

### 10. The Nickel

**File:** `src/scrapers/cinemas/nickel.ts`

**Approach:**
- Uses `page.evaluate()` to extract data from JS-rendered page
- Playwright required

**Date Format:** `"Sunday 21.12"` + `"8.30pm"`

---

### 11. Everyman

**File:** `src/scrapers/chains/everyman.ts`

**Approach:**
- Playwright with date tab clicking
- Uses venue codes in URLs (e.g., `x0712` for Baker Street)

**URL Pattern:** `/venues-list/{code}-everyman-{slug}/`

**Venue Codes:**
```javascript
{
  "baker-street": "x0712", "barnet": "x06si", "belsize-park": "x077p",
  "borough-yards": "g011i", "broadgate": "x11nt", "canary-wharf": "x0vpb",
  "clapham": "x0jxj", "crystal-palace": "x0j4m", "hampstead": "x0f7n",
  "kings-cross": "x0jy2", "maida-vale": "x078e", "muswell-hill": "x0p2g",
  "screen-on-the-green": "x0j4h", "stratford": "x0kd1", "wembley": "x0j1b"
}
```

---

### 12. The Lexi Cinema

**File:** `src/scrapers/cinemas/lexi.ts`

**Status:** Currently broken - cannot extract dates from page

**Approach:**
- Uses Playwright for JS-rendered page
- Legacy ASP.NET site (`.dll` URLs)

**URL Pattern:** `/TheLexiCinema.dll/Home`

**Known Issue:** Film cards found but date text extraction fails

---

## Common Patterns

### Cloudflare Protected Sites
Sites with Cloudflare (BFI) require:
1. Playwright with stealth plugin
2. Long wait times (45+ seconds)
3. Session warming on homepage before navigation

### Date Parsing
Most sites use one of these patterns:
- Full format: `"Friday 19 December 2025 14:30"`
- Short format: `"Mon 22 Dec"` + separate time
- ISO format: `"2025-12-21T18:30:00"`

### Time Parsing - CRITICAL

**Always ensure AM/PM is correctly captured.** A common bug is showing afternoon screenings as early morning.

**Common time formats:**
- 24-hour: `"14:30"`, `"18:00"` - unambiguous
- 12-hour with suffix: `"2:30PM"`, `"6:00 pm"` - need to parse AM/PM
- Split elements: `<time>2:30</time>PM` - need FULL text, not just `<time>` content

**Rules for time parsing:**
1. **Get the COMPLETE text** - Some sites split time and AM/PM into separate elements
   - WRONG: `$el.find('time').text()` -> "2:30" (missing PM)
   - RIGHT: `$el.text()` -> "2:30PM"

2. **Handle missing AM/PM** - If hour is 1-9 without AM/PM indicator, assume PM
   - Cinema screenings at "2:00" mean 14:00, not 02:00
   - Early morning screenings (before 10am) are extremely rare

3. **Validate after parsing** - Check that parsed times make sense
   - Most cinema screenings are between 10:00 and 23:59
   - Times like 02:15, 03:00 are almost certainly parsing errors

**Shared utility:** Use `src/scrapers/utils/date-parser.ts` which handles these cases.

### API vs Scraping
- Prefer APIs when available (Picturehouse is fastest)
- Use Playwright only when necessary (JS rendering, Cloudflare)
- Simple fetch for static HTML sites

---

## Debugging Tips

1. **No results found:** Check if selectors have changed
2. **Cloudflare timeout:** Increase wait time, check stealth mode
3. **Date parsing fails:** Log raw date text, check format
4. **Wrong venue:** Verify venue IDs/slugs in config
5. **Rate limiting:** Increase delay between requests
