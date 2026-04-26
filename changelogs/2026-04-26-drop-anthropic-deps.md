# Drop unused @anthropic-ai/* deps

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/remove-anthropic-deps`

## Changes

- Removed `@anthropic-ai/sdk` (^0.71.2) from `dependencies`.
- Removed `@anthropic-ai/claude-agent-sdk` (^0.1.76) from `devDependencies`.
- 330 transitive lockfile entries deleted as a result.

## Why

The 2026-02-28 Gemini migration moved every runtime AI call to `@google/genai` (and #454 routed enrichment to DeepSeek-V4-Flash). The two `@anthropic-ai/*` packages have had zero source imports since that migration but were still listed in `package.json`, costing install time in CI and confusing future readers.

Verified zero imports:
```
grep -rE "from ['\"]@anthropic-ai" --include="*.ts" --include="*.tsx" | grep -v node_modules
# (no output)
```

## Verification

- `npm run lint` → 0 errors, 41 warnings
- `npx tsc --noEmit` → clean
- `npm run test:run` → 913/913 pass

## Impact

- Smaller install footprint (~5 MB).
- No runtime change — these packages were already dead.
- Phase 2 item 1 from `tasks/todo.md` complete (warm-up before riskier majors).
