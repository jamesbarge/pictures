# CLAUDE.md

## Project Overview
London cinema calendar app (Pictures) that scrapes screening data from cinemas across London and displays it in a unified calendar view. We cover all cinemas with a special focus on independent venues. Production: https://pictures.london

## General Principles
- **Always think about a way to verify your work before starting any work.** Identify how you'll confirm changes work correctly (run tests, check database values, verify in browser, etc.).

## Verification
Before completing any task:
1. Run tests to verify nothing is broken
2. Run type checking and linting
3. Self-review: verify the solution matches the original request
4. Check for regressions in related functionality

Do not claim work is complete until all checks pass. Maximum 3 attempts per issue, then STOP and ask for guidance.

## Avoid
- Don't add new dependencies without asking first
- Don't create new utility files without checking if similar ones exist
- Don't refactor or "improve" code unrelated to the current task
- Don't guess at implementation patterns - check existing code first
- Don't make assumptions about requirements - ask for clarification

## When Stuck
If you encounter repeated failures or uncertainty:
1. Stop after 3 failed attempts
2. Summarize what you tried and why it failed
3. Ask the user for guidance before continuing

## Code Quality
- Read existing code before making changes
- Follow existing patterns and conventions in the codebase
- Keep changes minimal and focused on the task
- Don't over-engineer solutions

## Communication
- Be explicit about what you're doing and why
- Flag any uncertainties or assumptions
- Report errors clearly with context
- Ask clarifying questions early rather than guessing

## Changelogs - PRIORITY
**Every PR or direct ship to main MUST update BOTH changelog locations.**

### 1. Quick Summary: `RECENT_CHANGES.md` (root)
Add a new entry **at the top** of the file. Keep only the last ~20 entries.

Format:
```markdown
## YYYY-MM-DD: Short Description
**PR**: #XX | **Files**: `path/to/file.ts`, `other/file.ts`
- What changed (bullet points)
- Why it matters

---
```

### 2. Detailed Archive: `/changelogs/YYYY-MM-DD-short-description.md`
Create a new file with full details including impact and context.

Format:
```markdown
# Short Description

**PR**: #XX
**Date**: YYYY-MM-DD

## Changes
- Detailed bullet points

## Impact
- Who/what this affects
```

## Git Workflow
- **Never commit directly to `main`**; use feature branches (`fix/...`, `feat/...`).
- Use conventional commits (`fix:`, `feat:`, `chore:`, `docs:`).
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` when AI-assisted.
- Create PRs and squash-merge unless explicitly told otherwise.

## Tech Stack
- Next.js 16 App Router, React 19
- Drizzle ORM with PostgreSQL on Supabase (not Neon)
- Scrapers: Playwright (JS-heavy), Cheerio (static), API-based
- date-fns for date manipulation
- Clerk for auth, PostHog for analytics, Zustand for client state

## Non-Negotiable Workflow
- Use feature branches (never commit directly to `main`)
- Keep changes minimal and scoped to the request
- Before finishing: run `npm run test:run`, `npm run lint`, and `npx tsc --noEmit`
- Update both changelog locations on every PR

## Scraper Documentation
- Keep scraper implementation notes in `src/scrapers/SCRAPING_PLAYBOOK.md`
- Do not reference `docs/scraping-playbook.md`

## Deployment Gate
Production actions (merge to main, deploy, push to prod) require explicit keyword approval: "ship it", "deploy", "push to prod", "go live". Commands like "continue", "go", "next" mean proceed with next development step only.

## Inline Secrets
Never run commands with inline secrets or API keys. Always reference env vars from `.env.local`.

## PR Review Gate
Before creating any PR that touches 3+ files, run the code-reviewer agent on the diff. Report findings before proceeding.

## Autonomous Systems (AutoResearch)
AI-driven experiment loops that self-improve data quality overnight. Details in `.claude/rules/data-quality.md`.
- `/autoscrape` — Detect broken scrapers, run repair experiments, write Obsidian report
- `/autoquality` — Compute baseline DQS, tune thresholds, write Obsidian report
- Reports: `Obsidian Vault/Pictures/AutoResearch/`

## Domain Rules
Domain-specific rules are in `.claude/rules/`:
- `scrapers.md` - Scraper architecture, critical rules, testing
- `database.md` - Data integrity, storage, cleanup
- `data-quality.md` - Enrichment strategy, key scripts, AutoResearch
- `frontend.md` - UI, auth, state management, env vars
