# CLAUDE.md - Project Rules for AI Assistants

## Project Overview
London cinema calendar app that scrapes screening data from independent cinemas and displays them in a unified calendar view.

## Scraping Rules

### Time Parsing - CRITICAL
- **Always capture AM/PM** - Many sites split time elements: `<time>2:15</time>PM`
- Use full element text (`$el.text()`), not just inner elements like `$el.find('time').text()`
- If hour is 1-9 without AM/PM indicator, assume PM - cinema screenings at "2:00" mean 14:00, not 02:00
- Times before 10:00 are almost certainly parsing errors - validate and warn
- Use the shared date parser at `src/scrapers/utils/date-parser.ts` which handles these cases

### Scraper Documentation
- **Always update `docs/scraping-playbook.md`** when fixing or modifying scrapers
- Document: URL patterns, selectors, date/time formats, known issues
- Each cinema has unique quirks - document them for future reference
- When a scraper breaks, check the playbook first before investigating

### Scraper Testing
- Test scrapers by checking actual database values, not just screening counts
- Verify times are sensible (most screenings are between 10:00-23:59)
- Check specific films to confirm times match the cinema website
- Run cleanup after fixing parsing bugs to remove incorrect historical data

### Data Integrity
- Clean up bad data after fixing parsing bugs - don't leave incorrect records
- Screenings with times before 10:00 should be investigated as likely errors
- When re-scraping after a fix, verify old incorrect data doesn't persist

## Database Rules

### Screening Filtering
- Filter out past screenings using current time (`new Date()`), not start of day
- Use `gte(screenings.datetime, now)` to exclude screenings that have already started
- A 2pm screening should not appear after 2pm on that day

### Cleanup Scripts
- When fixing time parsing bugs, delete affected screenings with suspicious times
- Suspicious = times between 00:00-09:59 for cinema screenings

## UI Rules

### Time Display
- Display times in 24-hour format (e.g., "14:15") for clarity
- Never show screenings that have already started
- Filter is applied server-side in queries, not just client-side

## Tech Stack
- Next.js 16 with App Router
- Drizzle ORM with PostgreSQL (Neon)
- Playwright for JS-heavy sites (Curzon, BFI, Everyman)
- Cheerio for static HTML parsing
- date-fns for date manipulation

## Key Files
- `src/scrapers/` - All cinema scrapers
- `src/scrapers/utils/date-parser.ts` - Shared date/time parsing utilities
- `docs/scraping-playbook.md` - Documentation for each scraper
- `src/app/page.tsx` - Main calendar view
- `src/db/schema.ts` - Database schema

## Common Commands
```bash
npm run dev              # Start dev server
npm run scrape:curzon    # Run Curzon scraper
npm run scrape:bfi       # Run BFI scraper
npm run scrape:picturehouse  # Run Picturehouse scraper (fastest - uses API)
```
