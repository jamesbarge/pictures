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
- **Passes when:** EITHER (a) every cinema with `is_active = true` has ≥ 1 PostHog `booking_link_clicked` event in the trailing 30 days, OR (b) total site-wide clicks in that window are below the 500-event volume floor (the condition is deferred — see below).
- **Volume floor rationale:** at low traffic, per-cinema zero-click counts are a growth signal not a quality one. Confirmed empirically on 2026-05-15: 52 total events / 30d across 56 cinemas means the long tail will have zeros regardless of whether booking links work. The condition defers until the site has enough volume to make the metric meaningful.
- **Requires:** `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` in `.env.local`.
- **Sub-tasks:**
  - [ ] Replace the deferral path with a Stagehand-based verifier: load each cinema's most-recent future booking URL with a headless browser, assert the page contains the film title or cinema name. Traffic-independent. Tracked here so when /goal targets condition #6 above the floor we have the upgrade path queued.

### 7. Data quality floor
- **Measure:** `npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-dqs.ts`
- **Passes when:** the two most recent DQS scores recorded in `.claude/data-check-learnings.json` are both ≥ 85 composite. Single high score is not enough — the floor must hold across two consecutive `/data-check` runs.
- **Verification-signal deferral:** when `verificationPassRate ≤ 0.1` on both runs (structural breakage of the cinema verifiers, not real DB quality issues), the composite is recomputed excluding the 15% verification weight. If the adjusted composite clears the floor, the condition is deferred-passing (`pass: true, deferred: true`) — it does NOT count toward goal achievement. The verifiers must be fixed before #7 truly passes. The 85 floor is unchanged.
- **Sub-tasks:**
  - [ ] Investigate why `verificationPassRate` is at zero. The static HTML cinema verifiers (`verifyRioScreening`, `verifyIcaScreening`, `verifyBarbicanScreening`, `verifyCloseUpScreening`, `verifyGenesisScreening`, `verifyRichMixScreening` in `scripts/data-check.ts`) appear to be returning non-`confirmed` statuses across the board. Likely cause: cinema booking pages changed their HTML/title schemas. Identify which verifier(s) broke and patch the parsing.

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
