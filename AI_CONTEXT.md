# AI Context Index

Use this file as the single navigation entry point for AI agents and contributors.

## Read Order (Always)
1. `AGENTS.md` - canonical working rules and guardrails
2. `RECENT_CHANGES.md` - latest shipped changes (kept to ~20 entries)
3. `ARCHITECTURE.md` - system map and data flow
4. Task-specific docs from the table below

## Task Routing
| Task | Start Here | Then Check |
| --- | --- | --- |
| UI/Page changes | `src/app/`, `src/components/` | `src/stores/`, `src/lib/` |
| Scraper fixes | `src/scrapers/` | `src/scrapers/SCRAPING_PLAYBOOK.md`, `src/config/cinema-registry.ts` |
| DB/schema/scripts | `src/db/` | `drizzle.config.ts`, `src/db/schema/` |
| API behavior | `src/app/api/` | `src/lib/`, `src/db/` |
| Data quality agents | `src/agents/` | `src/agents/data-quality/README.md` |
| Outreach pipeline | `scripts/social-outreach/README.md` | `.github/workflows/social-outreach.yml` |

## Documentation Map
- Canonical agent rules: `AGENTS.md`
- Claude compatibility shim: `CLAUDE.md`
- Architecture overview: `ARCHITECTURE.md`
- Scraper maintenance playbook: `src/scrapers/SCRAPING_PLAYBOOK.md`
- Quick release context: `RECENT_CHANGES.md`
- Full release archive: `changelogs/`

## Low-Signal or Archive Areas (Usually Skip)
- `changelogs/` older entries unless historical context is needed
- `.planning/archive/` historical planning artifacts
- `playwright-report/` generated local test report output

## Changelog Workflow
- Every PR updates both:
  - `RECENT_CHANGES.md` (top entry only, keep file to ~20 entries)
  - `changelogs/YYYY-MM-DD-short-description.md` (full details)
- If `RECENT_CHANGES.md` grows beyond ~20 entries, trim from the bottom.

## Quick Sanity Checklist Before Shipping
- `npm run test:run`
- `npm run lint`
- `npx tsc --noEmit`
- Confirm changed docs still point to real paths
