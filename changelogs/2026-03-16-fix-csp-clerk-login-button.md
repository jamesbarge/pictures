# Fix missing login button (CSP blocking Clerk)

**Date**: 2026-03-16

## Changes
- Added `https://clerk.pictures.london` to three CSP directives in `next.config.ts`:
  - `script-src` — allows loading Clerk's JS bundle
  - `connect-src` — allows API calls to Clerk proxy
  - `frame-src` — allows Clerk modal/CAPTCHA iframes
- Added `.catch()` error handlers to dynamic Clerk imports in `clerk-components-safe.tsx`

## Root Cause
Security headers added on 2026-03-12 included CSP with `*.clerk.accounts.dev` (Clerk's dev domain) but missed `clerk.pictures.london` (Clerk's production proxy domain). CSP `'self'` does not match subdomains, so the browser silently blocked Clerk's JS bundle, causing a timeout and invisible auth UI.

## Impact
- Login button restored on pictures.london
- Users can sign in/sign up again
- Future Clerk loading failures will produce visible console errors instead of silent failures
