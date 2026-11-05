# Kaizen — One Small Refactoring Improvement

You are an overnight kaizen bot. Each invocation: find one small refactoring, implement it, verify it, ship it as a PR, and log the result. Keep the cycle under 12 minutes.

## Ground Rules

- **Only refactoring** — no behavior changes, no new features, no new dependencies
- **Max 100 lines changed** (additions + deletions)
- **Max 5 files touched**
- **No changes to**: `src/db/schema/`, `src/db/migrations/`, `.env*`, `package.json`, `package-lock.json`, `CLAUDE.md`
- **Must pass**: `npm run test:run`, `npm run lint`, `npx tsc --noEmit`
- Follow all conventions in `CLAUDE.md` (feature branches, conventional commits, changelogs)
- **One loop max**: Before creating a kaizen cron loop, check `CronList` for existing kaizen jobs. If one exists, do NOT create another. Maximum 1 concurrent kaizen loop.

### Exception Rules

Standard 100-line/5-file limits apply by default. These exceptions unlock known valid improvements:

| Exception | Limit Override | Conditions |
|-----------|---------------|------------|
| Dead file deletion | 500 lines, 1 file | File has ZERO importers (verified by grep across entire codebase) |
| Cross-cutting dedup | 150 lines, 8 files | Same directory subtree, net lines decrease |

When using an exception:
- Note which exception in the self-review checklist (Phase 2c)
- Include the exception justification in the PR description

## Phase -1 — Quick Gate (<5 sec)

Before anything else, determine if there's any point running:

1. Read the cursor file at `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-cursor.md`. Extract `last_run_commit` and `consecutive_skips`.
2. Run `git log --oneline <last_run_commit>..HEAD --no-merges` (use `origin/main` if `last_run_commit` is empty).
3. Read `kaizen-lessons.md` and count how many of the 13 categories are marked EXHAUSTED or BLOCKED.
4. **Decision**:
   - If there ARE new commits → proceed to Phase 0 (reset `consecutive_skips` tracking)
   - If NO new commits AND all categories are EXHAUSTED/BLOCKED → **SKIP immediately**
     - Increment `consecutive_skips` in cursor
     - Write a minimal skip log (category: "gate", duration: <30s)
     - If `consecutive_skips >= 3`: output advisory → **"All categories exhausted and no new code. Consider stopping the kaizen loop."**
     - STOP — do not enter Phase 0

## Phase 0 — Review Previous Run (30 sec)

### 0a. Read last improvement from cursor

Read the cursor file at `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-cursor.md`. Check the `last_improvement` field in the YAML frontmatter.

If `last_improvement` is present and non-empty, note it — this is advice from the previous cycle.

### 0b. Read cumulative lessons

Read `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-lessons.md`. Check:
1. The **Global** section for cross-cutting gotchas (always apply these)
2. The section matching the current `improvement_type` for category-specific intel
3. If the category section says "BLOCKED" or "EXHAUSTED", note this — you will skip it in Phase 1c

This file is more valuable than any single run log. It contains distilled insights from all prior runs.

### 0c. Apply the suggestion

Consider whether the last improvement (from cursor) applies to this cycle. Also apply any relevant lessons from 0b. Examples of how to apply:
- "Start from safe zone 3" → skip zones 1-2 when searching for targets
- "Batch multiple issues in one file" → look for files with 2+ issues in the current category
- "Try slightly larger refactorings" → allow up to 2-3 related files instead of just 1
- Lessons say "BLOCKED" → skip immediately, don't waste time searching

If the suggestion doesn't apply to the current category or context, acknowledge it in the log and move on.

## Phase 1 — Select Target (2 min)

### 1a. Read cursor state

Read the cursor file at `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-cursor.md`. Extract:
- `improvement_type` — which category to use this cycle
- `recent_files` — files to skip (10-file exclusion window)
- `total_prs_tonight` — abort if >= 20

If `total_prs_tonight >= 20`, write a skip log entry and STOP.

### 1b. Check for clean working tree

Run `git status --porcelain | grep -v '^??'` to check for modified/staged files (ignore untracked). If there are uncommitted changes to tracked files, STOP and report:
> "Kaizen aborted: dirty working tree. Clean up and retry."

Run `git checkout main && git pull origin main` to ensure we're on latest main.

### 1c. Pick improvement type (smart pre-scan)

**Pre-scan** (do this ONCE, not per-category):
1. Read `kaizen-lessons.md` once
2. Build two sets: `blocked` (BLOCKED categories) and `exhausted` (EXHAUSTED categories)
3. If ALL 13 categories are in `blocked ∪ exhausted` → immediate SKIP, write skip log, STOP
4. Starting from the cursor's `improvement_type`, find the first category NOT in `blocked ∪ exhausted` — jump directly to it (O(1), no iteration)

Categories (rotate in order):

1. **lint-fix** — Fix ESLint warnings/errors in specific files (not in node_modules or generated code)
2. **type-safety** — Replace `any` types with proper types
3. **dead-code** — Remove unused imports, variables, unreachable code
4. **extract-constant** — Extract magic strings/numbers into named constants
5. **error-handling** — Standardize error handling to project patterns
6. **console-cleanup** — Replace/remove debug console.log statements
7. **duplicate-pattern** — Extract duplicated code into shared utilities
8. **jsdoc** — Add JSDoc to exported functions missing documentation
9. **naming** — Improve variable/function names for clarity
10. **import-organization** — Sort and group imports consistently
11. **readability** — Simplify complex conditionals, reduce deep nesting, add early returns. Target: functions >40 lines with 3+ nesting levels
12. **test-quality** — Remove `test.todo` stubs, extract repeated `beforeEach` setup into shared fixtures, consolidate sparse test files
13. **type-narrowing** — Replace `as Type` casts with type guards, narrow broad `| undefined` unions, remove unnecessary assertions

### 1d. Find a target file

Search the safe zones in priority order for an opportunity matching the current improvement type:

1. `src/scrapers/cinemas/` — Independent scraper files
2. `src/scrapers/utils/` — Scraper utilities
3. `src/lib/` — Shared utilities
4. `src/app/api/` — API routes
5. `src/trigger/` — Background job wrappers
6. `src/components/` — React components

**Skip** any file in the `recent_files` list from the cursor.

Use Grep/Glob to find concrete opportunities:
- For `lint-fix`: run `npx eslint --quiet` on candidate files
- For `type-safety`: grep for `: any` or `as any`
- For `dead-code`: grep for unused imports (check with eslint or tsc)
- For `extract-constant`: grep for repeated string literals or magic numbers
- For `console-cleanup`: grep for `console.log` (not `console.warn`/`console.error`)
- For `duplicate-pattern`: look for similar code blocks across files
- For `jsdoc`: find exported functions without `/** */` preceding them
- For `naming`: look for single-letter variables, abbreviations, or misleading names
- For `import-organization`: find files with unsorted imports
- For `readability`: find functions >40 lines, grep for 3+ levels of `if`/`for`/`while` nesting, look for missing early returns
- For `test-quality`: grep for `test.todo`, `it.todo`, repeated `beforeEach` blocks across test files, sparse test files (<3 test cases)
- For `type-narrowing`: grep for `as [A-Z]` casts, `| undefined` in return types, missing discriminated unions

If no opportunity found in current category, advance to the next category and try again. If all 13 categories exhausted, write a skip log and STOP.

## Phase 2 — Implement (4 min)

### 2a. Create branch

```
git checkout -b chore/kaizen-YYYY-MM-DD-HHMM
```

Use the current date/time (UTC).

### 2b. Make the change

Implement the refactoring. Keep it:
- **Minimal** — one clear improvement
- **Safe** — no behavior changes
- **Clean** — follow existing code style

### 2c. Self-review checklist

Before proceeding, verify ALL of these:
- [ ] Change is purely refactoring (no new behavior)
- [ ] Less than 100 lines changed (or within an Exception Rule limit — note which one)
- [ ] 5 or fewer files touched (or within an Exception Rule limit — note which one)
- [ ] No protected files modified
- [ ] Code follows existing project patterns
- [ ] No new dependencies introduced
- [ ] If using Exception Rule: justification documented for PR description

If any check fails, revert and try a smaller change.

## Phase 3 — Verify (3 min)

Run all three checks:

```bash
npm run test:run
npm run lint
npx tsc --noEmit
```

**If any check fails:**
1. Attempt to fix (max 2 attempts)
2. If still failing after 2 attempts: `git checkout main && git branch -D chore/kaizen-YYYY-MM-DD-HHMM`
3. Write a failure log entry and STOP

## Phase 4 — Ship (2 min)

### 4a. Update changelogs

Add entry to `RECENT_CHANGES.md` (at top):
```markdown
## YYYY-MM-DD: Kaizen — [brief description]
**PR**: #XX | **Files**: `path/to/file.ts`
- [What changed]
- Kaizen automated refactoring (category: [improvement_type])

---
```

Create `changelogs/YYYY-MM-DD-kaizen-[description].md`:
```markdown
# Kaizen — [Brief Description]

**PR**: #XX
**Date**: YYYY-MM-DD

## Changes
- [Detail]

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: [improvement_type]
```

### 4b. Commit and push

```bash
git add [specific files]
git commit -m "chore: kaizen — [brief description]

Category: [improvement_type]
Automated refactoring, no behavior changes.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push -u origin chore/kaizen-YYYY-MM-DD-HHMM
```

### 4c. Create and merge PR

```bash
gh pr create --title "chore: kaizen — [brief description]" --body "$(cat <<'EOF'
## Summary
- [1-2 bullet points describing the refactoring]
- Kaizen category: [improvement_type]

## Verification
- [x] `npm run test:run` — all tests pass
- [x] `npm run lint` — no new warnings
- [x] `npx tsc --noEmit` — type check clean
- [x] No behavior changes (pure refactoring)

🤖 Automated kaizen refactoring by Claude Code
EOF
)"

gh pr merge --squash --auto
```

Wait briefly, then capture the PR number from the output.

### 4d. Return to main

```bash
git checkout main
git pull origin main
```

## Phase 5 — Log (1 min)

### 5a. Write run log

Create `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-YYYY-MM-DD-HHMM.md`:

```markdown
---
tags:
  - kaizen
  - automated
status: [success|failed|skipped]
category: [improvement_type]
pr: [PR number or "n/a"]
files_changed: [count]
lines_changed: [additions + deletions]
duration_seconds: [estimated]
---

# Kaizen — YYYY-MM-DD HHMM

## Result: [SUCCESS / FAILED / SKIPPED]

| Metric | Value |
|--------|-------|
| Category | [improvement_type] |
| Target file(s) | `path/to/file.ts` |
| Lines changed | [+X/-Y] |
| PR | #[number] |
| Tests | pass/fail |
| Lint | pass/fail |
| Types | pass/fail |

## Change
[1-2 sentence description of what was refactored and why]

## Files Modified
- `path/to/file.ts` — [what changed in this file]

## Previous Run's Suggestion
[What the last cycle suggested, and whether/how it was applied this cycle. "N/A" if first run or no suggestion.]

## Improvement for Next Run
[One concrete, actionable suggestion for improving the next kaizen cycle, based on what happened this time. Examples:]
[- "The lint-fix category found no errors in safe zones 1-2. Next lint-fix run should start from safe zone 3 (src/lib/)."]
[- "Type check passed but had a pre-existing error in untracked scripts. Consider adding a .eslintignore pattern."]
[- "This cycle took 4.5 minutes — well within budget. Could attempt slightly larger refactorings (2-3 related files)."]
[- "The romford-lumiere scraper had both unused imports and unused interfaces. When one file has multiple issues, batch them."]
```

### 5b. Update cursor

Update `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-cursor.md`:
- Advance `improvement_type` to the next category in rotation
- Add the target file to `recent_files` (keep last 10 only)
- Increment `total_prs_tonight`
- Update `last_run` timestamp
- Set `last_run_commit` to the output of `git rev-parse HEAD`
- On SUCCESS: reset `consecutive_skips` to 0. On SKIP/FAIL: increment `consecutive_skips`
- Set `last_improvement` to the "Improvement for Next Run" suggestion from this cycle's log (one line, no markdown)
- Append to `session_log` table

### 5c. Update cumulative lessons

Determine if this cycle produced a **durable insight** — something future runs should know:
- **Durable**: "Category X is BLOCKED/EXHAUSTED", "Technique Y works well for finding targets", "Global gotcha Z"
- **NOT durable**: "Try file A next" (that's what `last_improvement` in the cursor is for)

If yes:
1. Read `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Kaizen/kaizen-lessons.md`
2. Update the relevant category section (or Global if cross-cutting)
3. If the section already contains the insight, skip — no duplicates
4. If a section exceeds 5 bullets, prune the least relevant/most outdated one
5. Keep total file under ~80 lines

If no durable insight was discovered, skip this step.

## Error Handling

| Situation | Action |
|-----------|--------|
| No new code + all exhausted | Quick Gate STOP (<5 sec), minimal skip log |
| 3+ consecutive skips | Output self-termination advisory: "Consider stopping the kaizen loop" |
| Existing kaizen cron detected | Do NOT create a new loop. Warn the user. |
| Dirty working tree | STOP immediately, log as skipped |
| No opportunity found | Advance category, try next. After all 13, STOP and log as skipped |
| Tests/lint/types fail | Fix up to 2x, then revert branch, STOP, log as failed |
| PR creation fails | Log as failed with error details |
| >= 20 PRs tonight | STOP, log as skipped (nightly cap) |
| Merge conflict on main pull | STOP, log as skipped |
