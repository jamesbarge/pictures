# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-10)

**Core value:** Season discovery — helping users find what seasons are currently running.
**Current focus:** Phase 8 — Director Pages (complete)

## Current Position

Phase: 8 of 10 (Director Pages)
Plan: 1 of 1 in current phase
Status: Phase complete
Last activity: 2026-01-11 — Created director browse and detail pages

Progress: ████████░░ 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: ~5 min
- Total execution time: ~45 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Database Schema | 1 | 4 min | 4 min |
| 2. Season Scraper Research | 1 | 5 min | 5 min |
| 3. Scraper Infrastructure | 1 | 5 min | 5 min |
| 4. BFI Season Scraper | 1 | 6 min | 6 min |
| 5. Additional Cinema Scrapers | 1 | 10 min | 10 min |
| 6. Director Enrichment | 1 | 5 min | 5 min |
| 7. /seasons Page | 2 | 10 min | 5 min |
| 8. Director Pages | 1 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 10, 5, 5, 5, 5 min
- Trend: Steady (~6 min per plan)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 1 | Season → Films (not Screenings) | Seasons group films which already link to screenings |
| 1 | Cross-cinema via sourceCinemas array | Seasons can span multiple venues |
| 1 | Director fields for enrichment | directorName + directorTmdbId for Phase 6 TMDB |
| 2 | BFI first, then Close-Up/Barbican/PCC | BFI has highest volume and richest data |
| 2 | Complement existing pipeline | Season scrapers create entities; pipeline still extracts text |
| 3 | Template method pattern | Mirror existing BaseScraper for consistency |
| 3 | Multi-strategy film matching | Exact, year+title, director+title, fuzzy (Levenshtein) |
| 4 | Playwright for BFI | Cloudflare protection requires stealth browser |
| 4 | Heading-first film detection | Find h2/h3 headings with "Read more" links to identify films |
| 5 | Close-Up from JSON film_url | Season slug embedded in existing data structure |
| 5 | Barbican series discovery | Find /whats-on/series/ links from cinema page |
| 5 | PCC dedicated section | /seasons-events/ has curated programming |
| 5 | ICA strand patterns | Pattern match in-focus-*, long-takes, etc. |
| 6 | Extend existing TMDBClient | Person methods follow same patterns as movie methods |
| 6 | findDirectorId with department filter | Prioritize known_for_department === "Directing" |
| 6 | Director lookup caching | Avoid duplicate TMDB queries for same director name |
| 7 | Follow /cinemas page pattern | Server components, force-dynamic, max-w-4xl layout |
| 7 | Status-based sorting | Ongoing first, then upcoming, hide past seasons |
| 7 | Films with screenings | Detail page shows film cards with upcoming screening links |
| 8 | TMDB ID as URL parameter | Directors identified by TMDB ID for reliable linking |
| 8 | Active directors prioritized | Browse shows active first, past collapsed with opacity |
| 8 | Filmography from TMDB | Show 12 recent films, full bio/photo from TMDB API |

### Deferred Issues

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-11
Stopped at: Completed Phase 8 director pages
Resume file: None
Next: Phase 9 (Calendar Integration) — Seasons as filters/tags
