# Dependabot for npm and GitHub Actions

**PR**: #759
**Date**: 2026-10-03

## Changes
- New `.github/dependabot.yml` with three update entries: npm at `/` (Next.js backend), npm at `/frontend` (SvelteKit) and GitHub Actions. The two npm entries stay separate because the apps deploy separately, so a breaking frontend bump never holds back backend updates.
- npm runs weekly on Monday at 07:00 Europe/London and Actions runs monthly. Each app gets one grouped PR for all minor and patch bumps, and every major arrives in its own PR.
- Minor and patch security fixes are grouped too, one PR per lockfile, while a major security fix gets its own PR. Ungrouped, each advisory would open its own PR, run the full Tests workflow (Frontend E2E drives ~200 page loads against the production API) and conflict on the shared lockfile with every other open one.
- All three entries carry a 7-day `cooldown`, so Dependabot proposes a new release only once it is a week old. Hijacked npm releases are usually caught and pulled within days. The cooldown gates the package being bumped: its transitive dependencies still resolve to the newest in range, and a local `npm install` skips it. Security updates skip it as well.
- The workflows pin floating major tags (`actions/checkout@v4`), so Actions minor and patch releases reach CI without a PR, and the Actions entry only ever proposes new majors. Pinning to commit SHAs would bring every release under review; that is left for a follow-up.
- Hold-backs on the backend entry:
  - `@types/node` majors are ignored while `.nvmrc` pins Node 22, because newer majors type APIs that Node 22 lacks.
  - `drizzle-orm` and `drizzle-kit` share a `drizzle` group, apart from the weekly one. Both are 0.x, where a "minor" bump can break the API, and a kit out of step with the ORM breaks migrations.
  - `rebrowser-playwright` is excluded from the weekly group. Each bump ships a new bundled Chromium and CI never runs a scraper, so it gets its own PR to check with `/scrape-one` before merging. Upstream has published nothing since 1.52.0 in May 2025, so this rarely fires.
- Commit prefixes are `chore(deps)`, `chore(deps-dev)` and `ci(deps)`, in line with the repo's conventional commits.
- `CLAUDE.md` exempts PRs opened by `dependabot[bot]` from the two-location changelog rule.
- Repo settings (outside git): Dependabot alerts and Dependabot security updates were switched on 2026-10-03; both had been off.

## Impact
- The first scan found 163 open advisories across 42 packages: 5 critical, 51 high, 86 medium and 21 low, with 116 in the backend lockfile and 47 in the frontend's. The criticals sit in three packages:
  - `next` has three RCE advisories, all fixed by 16.3.6 (the lockfile has 16.2.7). One is Windows-only and one lives in `next/og`, which the backend never imports. The third is in the image optimiser when it processes AVIF files.
  - `maplibre-gl` has an XSS. It is a direct frontend dependency on `^5.21.1` and the fix is 6.4.1, a major bump.
  - Transitive `tar` has a DoS.
- Security updates honour `ignore`. Ignoring `maplibre-gl` majors would also block 6.4.1, so check open alerts before adding an ignore rule.
- Dependabot PRs cannot read Actions secrets. No job in `test.yml` needs one to pass, so bot PRs run in the same environment as human ones; `E2E Tests` skips because `DATABASE_URL_TEST` is unset. The first two bot PRs (#757, #758) passed every check.
- Required checks on `main` are `Unit & Integration Tests`, `E2E Tests`, `Vercel – filmcal2` and `Vercel – frontend`. `Frontend E2E (pictures.london)` is missing from that list, so a red frontend suite on a grouped Svelte or Vite bump leaves the merge button enabled.
- Dependabot checks every entry as soon as the file lands on `main`, the monthly Actions one included. Expect up to 5 version PRs per entry within minutes of the merge, plus grouped security PRs.
- Verified locally against the SchemaStore `dependabot-2.0` schema, and the validator was confirmed to reject a misspelled key and an invalid interval. GitHub reads the file only once it is on `main`; after merge, check Insights > Dependency graph > Dependabot for a parse error.
