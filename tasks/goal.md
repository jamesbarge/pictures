# Goal — Pictures.london v1: complete, fast, accessible, trustworthy

**Set:** 2026-05-15
**Status:** IN_PROGRESS
**Owner:** /goal slash command (single canonical goal file — only one goal active at a time)

## Objective

Make pictures.london a complete, fast, accessible, and trustworthy London cinema calendar. When every end condition below is green for one consecutive `/goal` invocation, the goal is achieved and this file is rewritten with the next goal.

## End Conditions

Each condition declares the script that measures it. `/goal` runs every script every invocation; the goal is ACHIEVED only when all return `pass: true`.

### 1. London independents covered
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-coverage.ts`
- **Passes when:** every cinema slug in `coverageTargets` (below) exists in `cinemas` with `is_active = true` AND has ≥1 successful scraper_run with screening_count > 0 in the last 7 days.
- **Coverage targets** (edit this list to redefine the bar — `/goal` will not change it):
  - `cinema-museum`
  - `catford-mews`
  - `whirled-cinema`
  - `bertha-dochouse`
  - `hackney-cinematheque`
  - `the-castle-cinema-stoke-newington`  *(only if separate from existing castle-cinema)*
  - `chiswick-cinema`
- **Sub-tasks:** (filled in by /goal as it works each cinema)

### 2. No silent breakers, no critical flakies
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-silent-breakers.ts`
- **Passes when:** `detectSilentBreakers()` returns `[]`. When the ratio-based `detectFlakyCinemas()` detector lands on `main`, tighten this condition to also require zero `critical` flakies and update the script accordingly.
- **Sub-tasks:**

### 3. Zero broken booking links
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-booking-links.ts`
- **Passes when:** sampling 25 future screenings per active cinema, hard 404/410 rate is 0% AND total non-2xx rate is < 5%. Cinemas excluded from the live HTTP check: list any in the `bookingLinkExclusions` block of the script (e.g. SPAs that always 200).
- **Sub-tasks:**

### 4. Lighthouse mobile ≥ 90 (perf, a11y, SEO)
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-lighthouse.ts`
- **Passes when:** running lighthouse mobile preset against `https://pictures.london/`, mobile + desktop both score ≥ 90 on performance, accessibility, and SEO.
- **Sub-tasks:**

### 5. axe-core clean
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-axe.ts`
- **Passes when:** axe-core run against `https://pictures.london/` (mobile + desktop viewports) returns zero violations at impact `critical` or `serious`.
- **Sub-tasks:**

### 6. PostHog booking funnel proof-of-life
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-posthog-funnel.ts`
- **Passes when:** in the trailing 30 days, every cinema with `is_active = true` has ≥ 1 PostHog `booking_click` event recorded. Cinemas with zero clicks indicate a structurally broken booking URL even if HTTP returns 200.
- **Requires:** `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` in `.env.local`.
- **Sub-tasks:**

### 7. Data quality floor
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-dqs.ts`
- **Passes when:** the two most recent DQS scores recorded in `.claude/data-check-learnings.json` are both ≥ 85 composite. Single high score is not enough — the floor must hold across two consecutive `/data-check` runs.
- **Sub-tasks:**

## Cursor

```yaml
last_run: null
last_run_at: null
last_condition_targeted: null
last_delta: null
status: IN_PROGRESS
achieved_at: null
blocked_subtasks: []
```

## Achievement summary

(Filled in by `/goal` when all conditions pass for one consecutive invocation. Copied to `Obsidian Vault/Pictures/Goals/pictures-london-v1-achieved.md` on completion.)
