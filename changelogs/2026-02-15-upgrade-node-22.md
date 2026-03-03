# Upgrade Node.js from 20 to 22 LTS

**Date**: 2026-02-15
**Type**: Chore / Infrastructure

## Summary

Upgraded the project's Node.js target from v20 to v22 LTS. Node 22 is the current active LTS release with support through April 2027, and is already GA on Vercel.

## Motivation

The PostHog SDK packages (`posthog-node`, `@posthog/ai`) require `^20.20.0 || >=22.22.0`. Rather than a minimal patch bump within Node 20, we upgrade to the current LTS for longer-term support.

## Changes

### New files
- `.nvmrc` — Pins project to Node 22 for all contributors

### Modified files
- `package.json` — `@types/node`: `^20` → `^22`
- `.github/workflows/scrape-playwright.yml` — `NODE_VERSION: '20'` → `'22'`
- `.github/workflows/scrape.yml` — `node-version: '20'` → `'22'`
- `.github/workflows/test.yml` — `node-version: '20'` → `'22'` (both unit and E2E jobs)
- `.github/workflows/social-outreach.yml` — `node-version: '20'` → `'22'`

## Verification

- TypeScript type check: 0 errors
- ESLint: 0 errors (121 pre-existing warnings unchanged)
- Vitest: 588 tests passed
- Next.js production build: success

## Compatibility

All dependencies explicitly support Node 22:
- Next.js >=20.9, Clerk >=18.17, Inngest >=20, Playwright >=18, postgres >=12
- No deprecated APIs used (no `url.parse()`, no `Buffer()` without `new`)
- `tsconfig.json` target/module unchanged
