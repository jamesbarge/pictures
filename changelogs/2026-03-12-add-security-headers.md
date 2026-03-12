# Security — Add Security Headers

**Date**: 2026-03-12

## Changes
- Added comprehensive security headers via `next.config.ts` `headers()` export
- Content-Security-Policy restricts script, style, image, font, and connection sources
- CSP includes allowances for Clerk auth (accounts.dev, Cloudflare challenges, img.clerk.com)
- CSP includes Google Fonts (fonts.gstatic.com), Vercel Analytics, and Google Maps
- HSTS enforces HTTPS for 1 year with subdomains
- X-Frame-Options DENY prevents clickjacking
- X-Content-Type-Options nosniff prevents MIME type confusion
- Referrer-Policy limits referrer information leakage
- Permissions-Policy disables unused browser features (camera, microphone, geolocation)

## Impact
- HIGH: Provides defense-in-depth against XSS, clickjacking, and other browser-based attacks
- CSP limits damage if XSS is ever introduced
- `'unsafe-inline'` and `'unsafe-eval'` in script-src required for Next.js hydration/dev mode
