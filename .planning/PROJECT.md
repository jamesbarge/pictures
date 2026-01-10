# Accessibility Screening Flags

## What This Is

A feature for pictures.london that extracts and surfaces accessibility information for cinema screenings — baby-friendly, carer screenings, relaxed/autism-friendly, audio described, and subtitled showings. Makes it easy for parents, carers, and people with accessibility needs to find screenings that work for them.

## Core Value

Accurate data extraction — reliably getting the right accessibility info from cinema websites.

## Requirements

### Validated

- ✓ Scraper infrastructure (BaseScraper, pipeline, validators) — existing
- ✓ Screening database schema with film, cinema, datetime — existing
- ✓ Calendar view with filtering capability — existing
- ✓ Zustand stores for user preferences — existing
- ✓ 54 London cinemas with active scrapers — existing

### Active

- [ ] Extract accessibility flags from cinema websites during scraping
- [ ] Database schema for accessibility types (baby-friendly, carer, relaxed, AD, subtitled)
- [ ] Filter in calendar view for accessibility screening types
- [ ] Badges on screening cards showing accessibility features
- [ ] Badges on individual screening listing pages

### Out of Scope

- User preferences/profiles for preferred accessibility types — future v2
- Notifications for new accessible screenings — future v2
- Manual tagging interface — scraped data only for v1

## Context

London cinemas publish accessibility screening information on their websites but in inconsistent formats:
- Some use text labels ("Parent & Baby", "Relaxed Screening")
- Some use icons or badges
- Some have dedicated accessibility pages
- Information placement varies by cinema chain

Existing scraper architecture extracts screenings but doesn't currently capture accessibility metadata. This feature extends scrapers to extract this additional data.

**Accessibility types to capture:**
- Baby/parent-friendly (lights dimmed, lower volume)
- Carer screenings (free companion ticket)
- Relaxed/autism-friendly (sensory adjustments)
- Audio described (AD)
- Subtitled/captioned (HOH)
- Hearing loop available

## Constraints

- **Tech stack**: Must extend existing scraper architecture (BaseScraper pattern)
- **Database**: Use Drizzle ORM with existing PostgreSQL schema
- **UI**: Use existing Base UI components and Tailwind

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Scrape accessibility data, don't manually tag | Sustainable at scale, already have scraper infra | — Pending |
| Capture all accessibility types | Different users have different needs | — Pending |
| Filter + badges (not just one) | Filter to narrow, badges for quick scanning | — Pending |

---
*Last updated: 2026-01-10 after initialization*
