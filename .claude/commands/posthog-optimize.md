# PostHog Optimize — One Analytics Improvement

You are an iterative PostHog analytics optimizer. Each invocation: assess current PostHog state, select one improvement category, implement it, verify it, and log the result. Keep the cycle under 15 minutes.

## Ground Rules

- **One improvement per cycle** — do not batch multiple categories
- **No frontend UI changes** — may modify PostHog integration code, create dashboards/insights via API, update configs, but NOT touch frontend UI components or user-facing layouts
- **Respect existing event taxonomy** — do not rename events already tracked in production without a migration plan
- **Max 80 lines changed** for code changes (additions + deletions)
- **Max 4 files touched** for code changes
- **No changes to**: `.env*`, `package-lock.json`, `src/db/schema/`, `src/db/migrations/`
- **Must pass** (for code changes): `npm run test:run`, `npm run lint`, `npx tsc --noEmit`
- Follow all conventions in `CLAUDE.md` (feature branches, conventional commits, changelogs)
- **One loop max**: Before creating a posthog-optimize cron loop, check `CronList` for existing posthog-optimize jobs. If one exists, do NOT create another.

### Change Tracks

| Track | Categories | Ships via | Verification |
|-------|-----------|-----------|-------------|
| **Code** | integration-health, event-taxonomy, session-recording, sdk-upgrade | Branch + PR + merge | `npm run test:run && npm run lint && npx tsc --noEmit` |
| **API-only** | dashboard-evolution, cohort-refinement, funnel-optimization, alerting, feature-flag-hygiene | Direct PostHog API call | `healthCheck()` + resource existence check |

API-only changes do NOT need a branch, PR, or lint/type checks. They create/update PostHog resources directly via the REST API in `src/lib/posthog-api.ts`.

## Phase -1 — Quick Gate (<5 sec)

1. Read the cursor file at `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/PostHog/posthog-cursor.md`. Extract `last_run_timestamp` and `consecutive_skips`. If the file doesn't exist, this is the first run — proceed directly to Phase 1 with category `integration-health`.
2. Read `posthog-lessons.md` from the same directory. Count how many of the 10 categories are marked EXHAUSTED or BLOCKED. If the file doesn't exist, create it with empty category sections and proceed.
3. **Decision**:
   - If ALL categories are EXHAUSTED/BLOCKED → **SKIP immediately**
     - Increment `consecutive_skips` in cursor
     - Write a minimal skip log
     - If `consecutive_skips >= 3`: output advisory → **"All PostHog categories exhausted. Consider stopping the loop or waiting for new data/code changes."**
     - STOP
   - Otherwise → proceed to Phase 0

## Phase 0 — Review Previous Run (30 sec)

### 0a. Read last improvement from cursor

Read the cursor file at `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/PostHog/posthog-cursor.md`. Check the `last_improvement` field in the YAML frontmatter.

If `last_improvement` is present and non-empty, note it — this is advice from the previous cycle.

### 0b. Read cumulative lessons

Read `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/PostHog/posthog-lessons.md`. Check:
1. The **Global** section for cross-cutting gotchas (always apply these)
2. The section matching the current `category` for category-specific intel
3. If the category section says "BLOCKED" or "EXHAUSTED", note this — skip it in Phase 1c

### 0c. Apply the suggestion

Consider whether the last improvement applies to this cycle. Also apply any relevant lessons from 0b. Examples:
- "Dashboard-evolution: all obvious insights already exist" → focus on breakdowns or formulas instead of new insights
- "Event-taxonomy: SvelteKit tracking is behind Next.js" → prioritize SvelteKit parity
- "Category X is BLOCKED because PostHog API rate limit" → skip entirely

## Phase 1 — Assess & Select Target (3 min)

### 1a. Read cursor state

Read the cursor file. Extract:
- `category` — which category to use this cycle
- `recent_changes` — descriptions of last 10 changes to avoid duplicating
- `total_improvements_tonight` — abort if >= 15

If `total_improvements_tonight >= 15`, write a skip log entry and STOP.

### 1b. Query PostHog current state

**Always** run this assessment before selecting a target:

```bash
cd /Users/jamesbarge/code/pictures && npx tsx -e "
import 'dotenv/config';
import { healthCheck, listDashboards, listActions, listCohorts, getEventDefinitions } from './src/lib/posthog-api';

async function assess() {
  const health = await healthCheck();
  if (!health.connected) { console.log('POSTHOG DISCONNECTED:', health.error); return; }

  const [dashboards, actions, cohorts, events] = await Promise.all([
    listDashboards(), listActions(), listCohorts(), getEventDefinitions(),
  ]);

  console.log(JSON.stringify({
    connected: true,
    dashboards: dashboards.results.map(d => ({ id: d.id, name: d.name })),
    dashboardCount: dashboards.count,
    actions: actions.results.map(a => ({ id: a.id, name: a.name })),
    actionCount: actions.count,
    cohorts: cohorts.results.map(c => ({ id: c.id, name: c.name })),
    cohortCount: cohorts.count,
    events: events.results
      .filter(e => !e.name.startsWith('$'))
      .sort((a, b) => (b.volume_30_day || 0) - (a.volume_30_day || 0))
      .slice(0, 25)
      .map(e => ({ name: e.name, volume_30d: e.volume_30_day })),
    totalCustomEvents: events.results.filter(e => !e.name.startsWith('$')).length,
  }, null, 2));
}
assess().catch(e => console.error('Assessment failed:', e.message));
"
```

If PostHog is disconnected, STOP and log as failed with the error.

### 1c. Pick category (smart pre-scan)

1. Read `posthog-lessons.md` once
2. Build two sets: `blocked` (BLOCKED) and `exhausted` (EXHAUSTED)
3. If ALL 10 categories are in `blocked ∪ exhausted` → immediate SKIP, write skip log, STOP
4. Starting from the cursor's `category`, find the first category NOT in `blocked ∪ exhausted` — jump directly to it

Categories (rotate in order):

1. **integration-health** (CODE) — SDK config audit: verify `capture_pageview: false` with manual tracking, proxy setup, persistence settings, consent flow, admin exclusion. Compare Next.js (`src/components/posthog-provider.tsx`) vs SvelteKit (`frontend/src/lib/analytics/posthog.ts`) integration parity.
2. **event-taxonomy** (CODE) — Naming consistency: check all `posthog.capture()` calls match snake_case convention, verify property names are consistent across events, identify missing events for user flows, flag redundant events.
3. **dashboard-evolution** (API) — Create new insights, update stale ones, remove unused. Look for gaps: are there insights for every tracked event? Are existing dashboards still relevant?
4. **cohort-refinement** (API) — Create/update user segments based on actual data patterns. Adjust thresholds based on real user distribution.
5. **funnel-optimization** (API) — Build/refine funnels for key user journeys. Identify drop-off points, create breakdown insights for worst steps.
6. **feature-flag-hygiene** (API) — Audit flags via API. Clean up stale flags (no evaluations in 30 days). Suggest new experiments based on funnel drop-offs.
7. **session-recording** (CODE) — Sampling config audit, privacy masking completeness (`[data-ph-mask]`), cost management, network capture settings.
8. **data-quality** (EITHER) — Missing properties in events, null values, volume anomalies, event schema drift between Next.js and SvelteKit codebases.
9. **alerting** (API) — Set up PostHog actions with webhook notifications, or create insight-based alerts for anomalies (booking clicks drops >50% WoW, search_no_results spikes).
10. **sdk-upgrade** (CODE) — Check current SDK versions against npm registry. If newer version with meaningful changes, upgrade.

### 1d. Find a concrete opportunity

For each category, use specific assessment techniques:

- **integration-health**: Read `src/components/posthog-provider.tsx` and `frontend/src/lib/analytics/posthog.ts`. Compare init configs. Check `next.config.ts` and `vercel.json` proxy rewrites. Verify SvelteKit has same privacy features as Next.js.
- **event-taxonomy**: Grep all `posthog.capture(` and `.capture(` calls across both codebases. List all event names and property schemas. Check for inconsistencies.
- **dashboard-evolution**: Compare PostHog API dashboard list against tracked events. Are there events with volume but no insight? Dashboards with zero recent views?
- **cohort-refinement**: Query event volumes. Check if cohort thresholds match actual user distribution.
- **funnel-optimization**: Query existing funnels. Look for steps with <20% conversion. Check if breakdowns reveal fixable segments.
- **feature-flag-hygiene**: List all feature flags via `posthogFetch('/api/projects/${projectId}/feature_flags/')`. Check `active`, creation dates, evaluation counts.
- **session-recording**: Check recording config in both providers. Query `listSessionRecordings()` for volume indicators.
- **data-quality**: Query recent events and check for null properties. Compare event schemas between Next.js and SvelteKit.
- **alerting**: List existing actions and check for webhook integrations. Identify key metrics without alerts.
- **sdk-upgrade**: Run `npm outdated posthog-js posthog-node` and check changelogs for meaningful changes.

If no opportunity found in current category, advance to next. If all 10 exhausted, STOP.

### 1e. Consult posthog-expert agent (optional)

For complex improvements, dispatch to the `posthog-expert` agent with:
- The selected category and current PostHog state
- The specific opportunity found
- Request: "Recommend the most impactful implementation for this category given the current state."

Use the agent's recommendation to refine the plan. Skip this step for straightforward improvements.

## Phase 2 — Implement (5 min)

### 2a. Determine track

Based on category:
- **Code track** (integration-health, event-taxonomy, session-recording, sdk-upgrade): Create branch, make code changes
- **API track** (dashboard-evolution, cohort-refinement, funnel-optimization, alerting, feature-flag-hygiene): Execute PostHog API calls directly
- **data-quality**: Either track depending on whether the fix is in code or via API

### 2b. Code track implementation

```bash
git checkout main && git pull origin main
git checkout -b chore/posthog-YYYY-MM-DD-HHMM
```

Implement the change. Keep it minimal, safe, and clean.

### 2c. API track implementation

Write a temporary script to execute the PostHog API call:

```bash
cd /Users/jamesbarge/code/pictures && npx tsx -e "
import 'dotenv/config';
import { createInsight, createCohort, createAction, createDashboard, listDashboards } from './src/lib/posthog-api';
// ... execute the improvement
// Tag all created resources with 'auto-optimize' for traceability
"
```

No branch needed. No repo files modified.

### 2d. Self-review checklist

**Code track:**
- [ ] Change is within PostHog integration code only (no UI components)
- [ ] Less than 80 lines changed
- [ ] 4 or fewer files touched
- [ ] No protected files modified
- [ ] No new dependencies introduced
- [ ] Follows existing patterns in posthog-api.ts / posthog-server.ts / posthog.ts

**API track:**
- [ ] Created resource has a clear, descriptive name
- [ ] Not duplicating existing dashboard/insight/cohort/action (verified in 1b)
- [ ] Query/filter syntax is valid PostHog HogQL / TrendsQuery / FunnelsQuery
- [ ] Tags include `auto-optimize`

## Phase 3 — Verify (2 min)

### Code track verification

```bash
npm run test:run
npm run lint
npx tsc --noEmit
```

If any check fails:
1. Attempt fix (max 2 attempts)
2. If still failing: `git checkout main && git branch -D chore/posthog-YYYY-MM-DD-HHMM`
3. Write failure log and STOP

### API track verification

Re-run the assessment from Phase 1b and confirm the new resource exists. Verify PostHog health check passes.

## Phase 4 — Ship (2 min)

### Code track shipping

**4a. Changelogs** — Add to `RECENT_CHANGES.md` (top) and create `changelogs/YYYY-MM-DD-posthog-[description].md`.

**4b. Commit and push**

```bash
git add [specific files]
git commit -m "chore: posthog-optimize — [brief description]

Category: [category]
Track: code
PostHog analytics improvement, no behavior changes.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push -u origin chore/posthog-YYYY-MM-DD-HHMM
```

**4c. Create and merge PR**

```bash
gh pr create --title "chore: posthog-optimize — [brief description]" --body "$(cat <<'EOF'
## Summary
- [1-2 bullet points]
- PostHog category: [category]

## Verification
- [x] `npm run test:run` — pass
- [x] `npm run lint` — pass
- [x] `npx tsc --noEmit` — pass
- [x] No UI changes

🤖 Automated PostHog optimization by Claude Code
EOF
)"

gh pr merge --squash --auto
```

**4d. Return to main** — `git checkout main && git pull origin main`

### API track shipping

No git operations needed. The PostHog API call was the ship step. Proceed to Phase 5.

## Phase 5 — Log (1 min)

### 5a. Write run log

Create `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/PostHog/posthog-YYYY-MM-DD-HHMM.md`:

```markdown
---
tags:
  - posthog
  - automated
status: [success|failed|skipped]
category: [category]
track: [code|api]
pr: [PR number or "n/a"]
resource_created: [name or "n/a"]
duration_seconds: [estimated]
---

# PostHog Optimize — YYYY-MM-DD HHMM

## Result: [SUCCESS / FAILED / SKIPPED]

| Metric | Value |
|--------|-------|
| Category | [category] |
| Track | [code/api] |
| Target | [file path or PostHog resource] |
| PR | #[number] or n/a |
| PostHog state | dashboards: N, cohorts: N, actions: N, events: N |

## Change
[1-2 sentence description]

## PostHog State Before
[Brief snapshot from Phase 1b]

## PostHog State After
[What changed]

## Previous Run's Suggestion
[What the last cycle suggested, whether/how it was applied]

## Improvement for Next Run
[One concrete, actionable suggestion for the next cycle]
```

### 5b. Update cursor

Update `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/PostHog/posthog-cursor.md`:

```markdown
---
tags:
  - posthog
  - cursor
category: [next category in rotation]
total_improvements_tonight: [N]
last_run_timestamp: "YYYY-MM-DDTHH:MM:SSZ"
session_start: "YYYY-MM-DDTHH:MM:SSZ"
consecutive_skips: [N]
last_improvement: "[suggestion from this run]"
---

# PostHog Optimize Cursor

## Current State

| Field | Value |
|-------|-------|
| Next category | [category] |
| Improvements tonight | [N] |
| Nightly cap | 15 |
| Last run | YYYY-MM-DD HH:MM UTC |

## Recent Changes (dedup window — keep last 10)

- [description of change]
- ...

## Session Log

| Time | Category | Track | Target | PR | Status |
|------|----------|-------|--------|-----|--------|
| HH:MM | [cat] | [code/api] | [target] | #N | SUCCESS |
```

On SUCCESS: reset `consecutive_skips` to 0, advance `category` to next in rotation.
On SKIP/FAIL: increment `consecutive_skips`, do NOT advance category.

### 5c. Update cumulative lessons

Determine if this cycle produced a **durable insight**:
- **Durable**: "Category X is BLOCKED/EXHAUSTED", "PostHog API quirk Y", "Global: always check both codebases"
- **NOT durable**: "Try creating insight A next" (that's `last_improvement` in cursor)

If yes:
1. Read `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/PostHog/posthog-lessons.md`
2. Update the relevant category section (or Global if cross-cutting)
3. No duplicates. If a section exceeds 5 bullets, prune the least relevant
4. Keep total file under ~100 lines

## Error Handling

| Situation | Action |
|-----------|--------|
| PostHog API disconnected | STOP immediately, log as failed |
| All categories exhausted/blocked | Quick Gate STOP, minimal skip log |
| 3+ consecutive skips | Output advisory: "Consider stopping the loop" |
| Existing cron detected | Do NOT create new loop. Warn user. |
| Dirty working tree (code track) | STOP, log as skipped |
| Tests/lint/types fail (code track) | Fix up to 2x, then revert branch, STOP |
| API call fails (API track) | Log error, STOP, log as failed |
| PR creation fails | Log as failed with error details |
| >= 15 improvements tonight | STOP, log as skipped (nightly cap) |
| PostHog rate limit (429) | Wait 60s, retry once. If still failing, STOP |
| No cursor file | First run — create with defaults (category: integration-health) |
| No lessons file | First run — create with empty category sections |
