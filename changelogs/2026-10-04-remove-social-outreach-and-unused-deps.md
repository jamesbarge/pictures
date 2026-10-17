# Remove social outreach pipeline, duplicate CI test run and unused dependencies

**PR**: #792
**Date**: 2026-10-04

## Changes
- Deleted `.github/workflows/social-outreach.yml` and `scripts/social-outreach/` (`run.ts`, `apify-runner.ts`, `attio-client.ts`, `config.ts`, `README.md`), the `outreach` and `outreach:dry-run` npm scripts, and the `AI_CONTEXT.md` routing row that pointed at them.
- `.github/workflows/test.yml`: removed the "Run tests" step from the unit-tests job. The next step, `npm run test:coverage` (`vitest run --coverage`), uses the same config, runs the same 2,884 tests and exits 1 when any test fails or coverage drops under its thresholds.
- `.github/workflows/test.yml`: the frontend E2E job now sets `PUBLIC_POSTHOG_KEY: ''` and `PUBLIC_POSTHOG_HOST: ''`. The old `${{ secrets.X || '' }}` expressions always resolved to `''` because the repo has neither secret.
- Removed seven packages with zero imports, config or CLI uses: `apify-client`, `@turf/turf` (geo-utils imports `@turf/boolean-point-in-polygon` and `@turf/helpers`, both still installed), `lottie-react`, `@esbuild-plugins/tsconfig-paths` (used by the retired `trigger.config.ts`), `@supabase/supabase-js`, `@types/cheerio` (cheerio 1.x ships its own types) and `eslint-plugin-jsx-a11y`.
- `eslint-plugin-jsx-a11y` stays in the tree as a dependency of `eslint-config-next`, which registers the plugin. A scratch `<img>` without `alt` still fails `npm run lint` with `jsx-a11y/alt-text`.
- `package-lock.json` loses 189 package entries, including axios and the full `@turf/turf` bundle. It adds 0 entries and changes 0 versions.
- `tsconfig.json`: dropped the `"packages"` exclude; the repo has no `packages/` directory.
- `src/app/api/admin/screenings/route.ts`: `crypto.randomUUID()` replaces `nanoid()`. `nanoid` was never listed in package.json. `screenings.id` is a `text` column documented as a UUID. The route test now checks the returned id is a v4 UUID in place of mocking `nanoid`.

## Impact
- CI: each unit-tests run executes the suite once, saving one full vitest pass per push and PR.
- Dependabot: axios arrived only through `apify-client` and leaves the tree, which makes the open axios bump (PR #758) safe to close.
- Admin: screenings created by hand from the admin UI get UUID ids. Existing rows are unchanged.
- The outreach pipeline never completed a run, so its removal affects no live behaviour.
