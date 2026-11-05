# Scraper Rules

## Architecture
- All scrapers extend `BaseScraper` (`src/scrapers/base.ts`)
- Chains: `src/scrapers/chains/` (Curzon, Picturehouse, Everyman)
- Independents: `src/scrapers/cinemas/` (BFI, PCC, ICA, Barbican, Rio, etc.)
- Types: Playwright (JS-heavy), Cheerio (static), API-based

## Critical Rules
- Always capture AM/PM when parsing times; use full element text, not inner nodes.
- If hour is 1-9 without AM/PM, assume PM.
- Times before 10:00 are likely errors; validate and warn.
- Use the shared parser at `src/scrapers/utils/date-parser.ts`.
- When fixing/modifying scrapers, update `src/scrapers/SCRAPING_PLAYBOOK.md` with selectors, URL patterns, formats, and known issues.
- After time parsing fixes, clean up bad data (screenings 00:00-09:59).

## Testing
- Verify actual database values, not just counts.
- Validate times are sensible (most screenings 10:00-23:59).
- Confirm a few films match the cinema website.
