# Data Quality Agent

Automated verification of film and screening data quality using Claude SDK and Claude in Chrome.

## Features

1. **Visual Verification** (Claude in Chrome)
   - Screenshots of film cards and screening listings
   - Verify posters display correctly
   - Check layout isn't broken
   - Spot visual anomalies

2. **Link Validation**
   - Verify booking URLs return 200/302 (not 404)
   - Flag broken or suspicious links
   - Check for redirect loops

3. **Data Completeness**
   - Films have poster, year, director
   - Screenings have valid times
   - TMDB enrichment succeeded

4. **Duplicate Detection**
   - Find similar film titles (fuzzy match)
   - Flag potential duplicate screenings
   - Identify orphaned films

## Usage

### Standalone CLI
```bash
# Full verification
npm run agents:verify

# Quick check (API only, no browser)
npm run agents:verify -- --quick

# Verify specific cinema
npm run agents:verify -- --cinema=bfi-southbank

# Verify recent additions only
npm run agents:verify -- --recent
```

### Post-Scrape Hook
Automatically runs after scraper completes when `ENABLE_AGENTS=true`.

## Architecture

```
src/agents/data-quality/
├── index.ts           # Main agent orchestrator
├── tools/
│   ├── browser.ts     # Claude in Chrome integration
│   ├── link-checker.ts
│   ├── data-checker.ts
│   └── duplicate-finder.ts
├── prompts/
│   └── verification.ts
└── types.ts
```

## Output

Issues are stored in the `data_issues` table:
- `type`: 'broken_link' | 'missing_data' | 'duplicate' | 'visual_issue'
- `severity`: 'critical' | 'warning' | 'info'
- `entity_type`: 'film' | 'screening' | 'cinema'
- `entity_id`: UUID of affected record
- `details`: JSON with issue specifics
- `resolved_at`: NULL until fixed
