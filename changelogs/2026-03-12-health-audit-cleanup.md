# Health Audit Cleanup — Consolidate Claude Code Configuration

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Merged AGENTS.md content into CLAUDE.md as the single source of truth
- Extracted domain rules into `.claude/rules/` (scrapers, database, data-quality, frontend)
- AGENTS.md reduced to a 3-line redirect stub for compatibility
- Added 3 new safety rules: deployment gate, inline secrets prohibition, PR review gate
- Updated README.md and AI_CONTEXT.md to reference CLAUDE.md instead of AGENTS.md
- Removed 129 stale/broken/dangerous entries from `.claude/settings.local.json` (including exposed API keys, JWT tokens, DB passwords, dangerous wildcards like `rm:*` and `kill:*`, broken shell fragments, and bare file paths)
- Updated global `~/.claude/CLAUDE.md` to simplify self-improvement loop
- Updated `.claude/commands/kaizen.md` to reference CLAUDE.md

## Impact
- All Claude Code sessions now load rules from CLAUDE.md + .claude/rules/ (no more AGENTS.md chain)
- Deployment actions require explicit approval keywords ("ship it", "deploy", etc.)
- Inline secrets can no longer be accidentally permitted via allowedTools
- PR review agent required before creating PRs touching 3+ files
