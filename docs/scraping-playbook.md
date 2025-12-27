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
| **Nickel** | API | No | `thenickel.co.uk/api/screenings/upcoming` | Working |
| **Everyman** | Date tabs | Playwright | `/venues-list/{code}-everyman-{slug}/` | Working |
| **Lexi** | Single page | Playwright | `/TheLexiCinema.dll/Home` | Broken |
| **Garden Cinema** | Single page | No | `thegardencinema.co.uk` homepage | Working |
| **Close-Up Cinema** | Embedded JSON | No | `closeupfilmcentre.com` homepage | Working |
| **Cine Lumiere** | Single page | No | `cinelumiere.savoysystems.co.uk/CineLumiere.dll/` | Working |

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

**File:** `src/scrapers/cinemas/the-nickel.ts`

**Approach:**
- Direct API call to `/api/screenings/upcoming` - **no browser needed**
- One of the fastest scrapers - single HTTP request
- Returns clean, structured JSON with film metadata

**API Endpoint:** `https://thenickel.co.uk/api/screenings/upcoming?limit=100`

**Response Format:**
```javascript
{
  id: 18,                           // Screening ID (used for booking URL)
  screeningDate: "2025-12-27T20:30", // ISO datetime
  doorsTime: "8pm",                 // Display text for doors
  filmTime: "8.30pm",               // Display text for film start
  capacity: 29,
  ticketsSold: 28,
  price: 1100,                      // In pence (£11.00)
  format: "Digital",
  film: {
    id: 6,
    title: "WAKE IN FRIGHT",
    description: "...",
    runtime: 114,
    year: 1971,
    country: "Australia",
    director: "Ted Kotcheff",
    imageUrl: "https://..."         // Poster image
  }
}
```

**Date Format:** ISO datetime `"2025-12-27T20:30"` - unambiguous, no parsing needed

**Booking URL Pattern:** `https://book.thenickel.co.uk/screening/{id}`

**Notes:**
- 37-seat micro-cinema in Clerkenwell specializing in cult/grindhouse films
- API is public and requires no authentication
- Returns complete film metadata including year, director, and poster
- Format can be: Digital, 35mm, 16mm
- Previously used Playwright but switched to API (Dec 2025)

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

### 13. Garden Cinema

**File:** `src/scrapers/cinemas/garden.ts`

**Approach:**
- Single page fetch from homepage
- No browser needed - HTML is static
- All screening data organized by date blocks on the homepage
- Extracts director and year from stats string

**Date Format:**
- Date: `data-date="YYYY-MM-DD"` attribute on date blocks
- Time: `"11:00"`, `"17:45"` - already in 24-hour format

**Key Selectors:**
- Date blocks: `.date-block[data-date]`
- Film cards: `.films-list__by-date__film`
- Title: `.films-list__by-date__film__title a`
- Rating (e.g., "U", "12A"): `.films-list__by-date__film__rating`
- Stats (director, year): `.films-list__by-date__film__stats`
- Screening times: `a.screening`

**Stats Format:** `"Director, Country, Year, Runtime"`
- Example: `"Greta Gerwig, USA, 2019, 135m."`
- Parser extracts director (first comma-separated value) and year

**URL Pattern:** Homepage only - `https://thegardencinema.co.uk`

**Notes:**
- Single-screen independent cinema in North London (Golders Green)
- Very clean data structure with well-labeled CSS classes
- Rating appears inside the title link and needs to be stripped
- All times are in 24-hour format, no AM/PM parsing needed

---

### 14. Close-Up Cinema

**File:** `src/scrapers/cinemas/close-up.ts`

**Approach:**
- Single page fetch from homepage
- No browser needed - data is embedded as JSON string
- All screening data stored in a JavaScript variable as a quoted JSON string
- Uses TicketSource for booking

**Data Format:**
- Variable: `var shows ='[{...}]';` (JSON wrapped in single quotes as a string)
- NOT a direct JSON array like Rio Cinema

**JSON Structure:**
```javascript
{
  id: "56611",           // Screening ID
  fp_id: "4184",         // Film programme ID
  title: "Lolita",       // Film title
  blink: "https://www.ticketsource.co.uk/close-up-cinema/e-agrkqb",  // Booking URL
  show_time: "2025-12-28 14:00:00",  // Format: YYYY-MM-DD HH:MM:SS (24-hour)
  status: "1",           // 1 = active
  booking_availability: "book",
  film_url: "/film_programmes/2025/close-up-on-stanley-kubrick/lolita"
}
```

**Date/Time Format:** `"YYYY-MM-DD HH:MM:SS"` - already in 24-hour format, no AM/PM parsing needed

**Key Patterns:**
- Extract JSON string: `var\s+shows\s*=\s*'(\[[\s\S]*?\])'\s*;`
- The JSON has escaped forward slashes (`\/`) which is valid JSON

**URL Pattern:** Homepage only - `https://www.closeupfilmcentre.com`

**Notes:**
- Small intimate cinema in Shoreditch, East London
- Known for Stanley Kubrick retrospectives and curated seasons
- Simple data structure - single-screen venue
- All times in 24-hour format
- Booking handled via TicketSource

---

### 15. Cine Lumiere (Institut Francais)

**File:** `src/scrapers/cinemas/cine-lumiere.ts`

**Approach:**
- Single page fetch from Savoy Systems booking page
- No browser needed - HTML is static
- Parses film blocks with dates and time links
- Uses Savoy Systems `.dll` booking platform

**Date Format:**
- Date: `"Friday 6 Mar 2026"` (Day DD Mon YYYY)
- Time: `"16:00"`, `"18:15"` - already in 24-hour format

**Key Selectors:**
- Film links: `a[href*="TcsProgramme_"]`
- Time links: `a` elements with `/^\d{1,2}:\d{2}$/` pattern
- Date text: Lines matching `/(Monday|Tuesday|...|Sunday)\s+\d{1,2}\s+\w+\s*\d*/`

**Booking URLs:**
- Base: `https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/`
- Performance links contain `TcsPerformance_` identifiers

**URL Pattern:** Single page - `https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/`

**Notes:**
- Arthouse cinema at Institut Francais in South Kensington
- Specializes in French and European cinema
- Savoy Systems is a common UK cinema booking platform (also used by Lexi)
- Clean 24-hour time format - no AM/PM parsing needed
- Certificate ratings (15, 12A, etc.) stripped from film titles
- Some performances show "(Closed for Booking)" status - these are skipped
- Timezone: Times are in UK local time (GMT/BST). Running scrapers from non-UK timezone machines may cause 1-hour offset; production runs should use UK timezone

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
- Prefer APIs when available (Picturehouse, The Nickel are fastest)
- Use Playwright only when necessary (JS rendering, Cloudflare)
- Simple fetch for static HTML sites

---

## Debugging Tips

1. **No results found:** Check if selectors have changed
2. **Cloudflare timeout:** Increase wait time, check stealth mode
3. **Date parsing fails:** Log raw date text, check format
4. **Wrong venue:** Verify venue IDs/slugs in config
5. **Rate limiting:** Increase delay between requests
