# DRY stripCodeFences across gemini.ts + deepseek.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/strip-code-fences.ts` (new) — canonical implementation of `stripCodeFences`
- `src/lib/gemini.ts` — replaces inline implementation with `export { stripCodeFences } from "./strip-code-fences"`
- `src/lib/deepseek.ts` — same re-export pattern

## Why
The two modules had byte-identical implementations of `stripCodeFences` (noted as a follow-up in PR #545's body). This PR removes the duplication while preserving all import paths — callers continue to import from `@/lib/gemini` or `@/lib/deepseek` unchanged.

The dual-suite test from PR #545 (`ai-clients-stripcodefences.test.ts`) verifies both import paths still produce identical results after the consolidation — which is the test pattern's whole point.

## Impact
- Functional: none. Byte-identical re-export. Existing 20 vitest cases (10 × 2 import paths) still pass.
- Maintainability: a single source of truth for the regex chain. The pinned `^`-anchored behaviour is now documented in one place (a comment block in `strip-code-fences.ts`) rather than two slightly-diverging comments.
- Callers: zero changes needed; `@/lib/gemini` and `@/lib/deepseek` re-export the same symbol.

## Verification
`npx vitest run src/lib/ai-clients-stripcodefences.test.ts` — 20 passed, 0 failed.

## Changelog deferral note
Per #523-#530.
