# Dependency Update — Phase 1 (Safe Bumps Within Current Majors)

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/deps-update-phase-1`

## Context

`npm outdated` showed ~40 backend and ~14 frontend packages drifting from latest at the start of the session. Phase 1 advances every dep within its current major version. Phase 2 (each major upgrade as its own PR) is queued in the plan file at `~/.claude/plans/update-all-project-dependencies-moonlit-wand.md`.

## Backend (`/package.json` + `/package-lock.json`)

`npm update` (caret-range moves) + explicit installs for pinned versions:

| Package | From → To |
|---|---|
| `@base-ui/react` | 1.3.0 → 1.4.1 |
| `@clerk/nextjs` | 6.39.0 → 6.39.3 |
| `@playwright/test` | 1.57.0 → 1.59.1 (range loosened from `~1.57.0` to `^1.59.1`) |
| `@posthog/ai` | 7.11.1 → 7.16.10 |
| `@supabase/supabase-js` | 2.99.1 → 2.104.1 |
| `@tailwindcss/postcss` | 4.2.1 → 4.2.4 |
| `@tanstack/react-query` | 5.90.21 → 5.100.5 |
| `@trigger.dev/build` + `@trigger.dev/sdk` | 4.4.3 → 4.4.4 |
| `@turf/boolean-point-in-polygon` + `@turf/turf` | 7.3.4 → 7.3.5 |
| `@types/node` | 22.19.15 → 22.19.17 |
| `@vis.gl/react-google-maps` | 1.7.1 → 1.8.3 |
| `@vitest/coverage-v8` + `vitest` | 4.1.0 → 4.1.5 |
| `apify-client` | 2.22.2 → 2.23.0 |
| `drizzle-kit` | 0.31.9 → 0.31.10 |
| `drizzle-orm` | 0.45.1 → 0.45.2 |
| `eslint-config-next` | 16.1.0 → 16.2.4 |
| `lint-staged` | 16.3.3 → 16.4.0 |
| `next` | 16.1.0 → 16.2.4 |
| `openai` | 6.27.0 → 6.34.0 |
| `playwright` | 1.57.0 → 1.59.1 (range loosened from `~1.57.0` to `^1.59.1`) |
| `postgres` | 3.4.8 → 3.4.9 |
| `posthog-js` | 1.362.0 → 1.372.1 |
| `posthog-node` | 5.28.4 → 5.30.4 |
| `react` + `react-dom` | 19.2.3 → 19.2.5 |
| `svix` | 1.88.0 → 1.92.2 |
| `tailwindcss` | 4.2.1 → 4.2.4 |
| `unpdf` | 1.4.0 → 1.6.0 |
| `use-debounce` | 10.1.0 → 10.1.1 |
| `zustand` | 5.0.11 → 5.0.12 |

## Frontend (`/frontend/package-lock.json`)

`npm update` only — every dep already used `^` ranges, so `frontend/package.json` itself didn't change.

| Package | From → To |
|---|---|
| `@playwright/test` | 1.58.2 → 1.59.1 |
| `@sveltejs/kit` | 2.55.0 → 2.58.0 |
| `@tailwindcss/vite` | 4.2.2 → 4.2.4 |
| `bits-ui` | 2.16.5 → 2.18.0 |
| `maplibre-gl` | 5.21.1 → 5.24.0 |
| `posthog-js` | 1.364.2 → 1.372.1 |
| `svelte` | 5.55.1 → 5.55.5 |
| `svelte-check` | 4.4.5 → 4.4.6 |
| `svelte-clerk` | 1.1.1 → 1.1.5 |
| `tailwindcss` | 4.2.2 → 4.2.4 |
| `vite` | 7.3.1 → 7.3.2 |

## Verification

Run from a clean checkout (generated dirs `.next/types`, `.svelte-kit/output`, `.vercel/output`, `.trigger/tmp/build-*` confuse lint because `eslint.config.mjs` doesn't ignore them — pre-existing bug, out of scope here):

- Backend: `npm run lint` → 0 errors, 41 warnings (origin/main baseline: 0 errors, 40 warnings — +1 acceptable)
- Backend: `npx tsc --noEmit` → clean
- Backend: `npm run test:run` → 913/913 pass (matches origin/main)
- Frontend: `npm run check` → 11 errors, 2 warnings (origin/main: 13/2 — slight improvement, all pre-existing)
- Frontend: `npm run dev` boots clean. Smoke-tested `/`, `/about`, `/cinemas`, `/map`, `/festivals` → all HTTP 200

## Local Engine Warnings

`@posthog/ai` 7.16.10 and `posthog-node` 5.30.4 require Node `^20.20.0 || >=22.22.0`. Local Node is 20.19.5; Vercel deploys use a newer Node and aren't affected. Bump local Node next time CI/runtime requirements force it.

## Impact

- Pulls every backend + frontend dep onto its latest patch within the current major. Closes the drift gap that was making Phase 2 majors (Clerk v7, Vite v8, TS v6) progressively harder to plan.
- No code changes. Lockfiles + targeted version-string moves in `package.json` only.
- No runtime behavior change expected. Verification above covers the standard project gates.

## Out of Scope (Phase 2 Backlog)

Each is its own follow-up PR sized to its own migration. Listed in rough priority order:

1. `@clerk/nextjs` v6 → v7 (auth-critical, has middleware + layout + API guards)
2. `vite` v7 → v8 + `@sveltejs/vite-plugin-svelte` v6 → v7 (frontend, bump together)
3. `typescript` v5 → v6 (both halves; stricter type checks)
4. `eslint` v9 → v10
5. `@vercel/analytics` v1 → v2 + `@vercel/speed-insights` v1 → v2
6. `lucide-react` 0.x → 1.x
7. `tailwind-merge` v2 → v3 (frontend)
8. `uuid` v13 → v14
9. `jsdom` v27 → v29 (test-env only)
10. `@chenglou/pretext` 0.0.3 → 0.0.6 (frontend)
11. **Cleanup**: remove unused `@anthropic-ai/sdk` + `@anthropic-ai/claude-agent-sdk` from backend deps (zero imports remain after Gemini migration).
