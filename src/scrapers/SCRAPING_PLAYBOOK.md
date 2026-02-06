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

### Curzon and Everyman
- Scrapers: `src/scrapers/chains/curzon.ts`, `src/scrapers/chains/everyman.ts`
- Notes: Playwright-heavy; more sensitive to markup and client-side app changes.
