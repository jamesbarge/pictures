# Stop tracking Playwright `test-results/` artifacts

**PR**: TBD
**Date**: 2026-04-25

## Changes
- `git rm` the three tracked Playwright artifacts:
  - `frontend/test-results/.last-run.json`
  - `frontend/test-results/test-all-Pictures-London-—-36192-ge-search-filters-directors-chromium/error-context.md`
  - `frontend/test-results/test-all-Pictures-London-—-da1ae--search-filters-cinema-list-chromium/error-context.md`
- Add `/test-results/` to root `.gitignore` (alongside the existing `/playwright-report/` and `/screenshots/`).
- Add `test-results/` and `playwright-report/` to `frontend/.gitignore`.

## Cause
Playwright writes its run metadata and failure artifacts under `test-results/` next to the test runner. Three of those files got committed at some point in the past (likely an accidental `git add .` during a fix). Because neither `.gitignore` excluded the directory, every subsequent run produced new untracked files in `git status`, and a future `git add .` could re-track new artifacts at any time.

This was the root cause of the recurring "untracked test-results clutter" that surfaced repeatedly during today's session — every branch switch, every test run, every cleanup attempt re-introduced the same noise.

## Impact
- `git status` after a Playwright run will no longer show test-results untracked files.
- Existing local `frontend/test-results/` directories on contributors' machines will start showing as untracked-and-ignored — `git clean -fdX` will remove them locally if desired.
- No effect on CI: the test runner doesn't care whether the artifacts are tracked.
