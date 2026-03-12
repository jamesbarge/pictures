# Remove `unsafe-eval` from CSP script-src

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Removed `'unsafe-eval'` from the Content-Security-Policy `script-src` directive in `next.config.ts`
- The directive now reads: `script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com`

## Impact
- Strengthens XSS protection by blocking `eval()`, `Function()`, and similar dynamic code execution in the browser
- Production Next.js does not require `unsafe-eval`; it was included as a precaution during initial setup but is unnecessary
- No functional regressions: all 789 tests pass, TypeScript compiles cleanly
