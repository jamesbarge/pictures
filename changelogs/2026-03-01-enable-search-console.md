# Enable Google Search Console + Bing Webmaster Tools

**Date**: 2026-03-01
**Branch**: `feature/enable-search-console`

## Summary

Activated search engine verification meta tags so Google Search Console and Bing Webmaster Tools can verify site ownership. This is the foundational prerequisite for all SEO measurement, indexing monitoring, and search performance data.

## Changes

### `src/app/layout.tsx`
- Uncommented the `verification` block inside `generateMetadata()`
- Google verification code sourced from `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env var
- Bing verification code sourced from `NEXT_PUBLIC_BING_SITE_VERIFICATION` env var (falls back to empty string)

### `.env.local.example`
- Added `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and `NEXT_PUBLIC_BING_SITE_VERIFICATION` with setup URLs

## Notes

- The existing `public/google7ea8fa19954d5e86.html` file remains as the primary Google verification method. The meta tag is a backup.
- Bing verification requires signing up at bing.com/webmasters and pasting the code into `.env.local`.
- Uses `NEXT_PUBLIC_` prefix because Next.js metadata API renders these values client-side.
