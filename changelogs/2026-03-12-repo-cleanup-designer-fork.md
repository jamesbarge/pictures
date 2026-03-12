# Repo Cleanup for Designer Fork

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Added MIT LICENSE file (copyright 2025-2026 James Barge)
- Simplified README Documentation Map section — replaced AI-specific file listing with single pointer to `ARCHITECTURE.md`
- Updated tech stack table: AI row now shows both Gemini (enrichment) and Claude Agent SDK (automation)
- Updated env vars: replaced `ANTHROPIC_API_KEY` with `GEMINI_API_KEY` to reflect migration
- Updated Data Sources: enrichment now correctly attributes Google Gemini
- Deleted 120 untracked junk files (duplicate-suffix files, one-off patrol/audit/fix scripts)
- Pruned 120+ stale local branches and 107 remote branches
- Removed 2 orphaned git worktrees

## Impact
- Repo looks clean and professional for external contributors / designers
- README is accurate and not cluttered with internal AI workflow references
- LICENSE file makes the MIT license declaration actionable
