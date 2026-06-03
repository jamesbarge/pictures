# Add unit tests for stripCodeFences (gemini.ts + deepseek.ts)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/ai-clients-stripcodefences.test.ts` (new) — 10 vitest cases run against BOTH gemini.stripCodeFences and deepseek.stripCodeFences (20 total assertions). The two implementations are byte-identical; the dual-suite pattern means a future refactor to extract a shared helper will surface any behaviour drift immediately.

## Coverage
- Strip ```json (with language tag) + trailing ```
- Strip ``` (no language tag) + trailing ```
- Strip ```json with no newline before content
- Pass-through for clean JSON (no fences)
- Empty input
- Whitespace-only input
- Preserve internal newlines
- Mid-string ``` NOT stripped (only leading/trailing)
- Idempotence on already-clean input
- **Pinned regex anchor contract**: whitespace BEFORE the leading fence prevents the strip (regex is `^`-anchored, `.trim()` runs AFTER the replace passes). A casual refactor to pre-trim would silently change behaviour.

## Why
Both AI clients pipe JSON responses through `stripCodeFences` before `JSON.parse()`. A regression here surfaces as `SyntaxError` from JSON.parse in the enrichment/QA/data-quality stacks — opaque failure mode. The pinned `^`-anchored contract is particularly worth pinning because "let me add a pre-trim to be safe" is exactly the kind of intuitive change that would break things.

## Future-proofing
The two implementations are byte-identical — a follow-up PR can extract them to a shared helper. This test file's dual-suite pattern is designed to make that refactor safe: the same 10 cases run against both function references, so consolidation can't silently change behaviour without test failures.

## Changelog deferral note
Per #523-#530.
