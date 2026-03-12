# Security — Fix XSS in JSON-LD and Sanitize Scraped Data

**Date**: 2026-03-12

## Changes
- Escaped `<` as `\u003c` in JSON-LD output to prevent `</script>` breakout
- Added `sanitizeScreening()` to strip HTML tags from scraped text fields
- Applied sanitization in `validateScreenings()` pipeline
- Added unit tests for both JSON-LD XSS prevention and screening sanitization

## Impact
- HIGH: Prevents stored XSS via malicious film titles in JSON-LD structured data
- Scraped HTML content now stripped before database insertion
