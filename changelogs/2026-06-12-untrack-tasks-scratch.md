# Untrack tasks/todo.md session scratch

**PR**: TBD
**Date**: 2026-06-12

## Changes
- Removed `tasks/todo.md` from git tracking (accidentally committed in #670 via an over-broad `git add -A` in an agent worktree — it's per-session scratch/handoff notes, not repo content)
- Added `tasks/todo.md` + `tasks/lessons.md` to `.gitignore`

## Impact
- Local session-handoff notes can no longer collide with pulls or leak into PRs
