# Kaizen — Remove Dead Import and Dead Method

**PR**: #280
**Date**: 2026-03-13

## Changes
- Removed dead `AGENT_CONFIGS` import from config.ts (cascading dead code from PR #278)
- Deleted dead `private extractYear()` method from romford-lumiere.ts (zero callers)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Found via `tsc --noUnusedLocals --noUnusedParameters`
