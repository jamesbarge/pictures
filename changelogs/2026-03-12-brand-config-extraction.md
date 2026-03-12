# Brand Config Extraction

**PR**: #228
**Date**: 2026-03-12

## Changes
- Created `src/lib/brand.ts` as single source of truth for all brand constants:
  - Site name, tagline, short/long descriptions
  - Production URL and social handles (Instagram, Letterboxd, Bluesky)
  - Theme colors and PWA manifest settings
  - OG image paths and default metadata
- Replaced static `public/manifest.json` with dynamic `src/app/manifest.ts` that generates the Web App Manifest from brand config
- Updated 22 files to import brand values from `brand.ts` instead of hardcoding them:
  - Page metadata across all route pages (about, cinemas, directors, films, seasons, tonight, this-weekend, terms, privacy)
  - SEO components (json-ld.tsx, json-ld.test.tsx)
  - Layout and UI components (layout.tsx, clerk-provider, cinema-map, share-screening-button)
  - Infrastructure (sitemap.ts, robots.ts, poster placeholder, trigger tasks)

## Impact
- **Rebranding**: Changing the site name, URL, colors, or social handles is now a single-file edit in `brand.ts`
- **Consistency**: Eliminates risk of brand values drifting out of sync across 20+ files
- **Maintainability**: New pages/components can import from `brand.ts` instead of copy-pasting strings
