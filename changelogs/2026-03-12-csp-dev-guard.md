# CSP — gate `unsafe-eval` behind development mode

**Date**: 2026-03-12
**PR**: #207

## What changed

The Content-Security-Policy `script-src` directive in `next.config.ts` now conditionally includes `'unsafe-eval'` only when `NODE_ENV === "development"`.

## Why

PR #204 removed `'unsafe-eval'` from the CSP entirely. While correct for production, React's development mode requires it for enhanced error overlays, source mapping, and Fast Refresh. Without it, `npm run dev` produces CSP violations in the browser console and degrades developer tooling.

## Details

- Added `const isDev = process.env.NODE_ENV === "development"` at top of config
- Used template literal interpolation to conditionally include the directive in `script-src`
- Production builds are unaffected — CSP remains hardened
