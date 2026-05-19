/**
 * Strip markdown code fences that LLM responses sometimes wrap around JSON.
 * Safe to call on text that doesn't have fences (idempotent identity).
 *
 * Shared by src/lib/gemini.ts and src/lib/deepseek.ts — historically each
 * exported its own byte-identical copy. Consolidated 2026-05-18 to a single
 * source of truth; the gemini/deepseek modules now re-export this for
 * backwards compatibility with existing callers.
 *
 * Pinned contract (see `ai-clients-stripcodefences.test.ts` — the dual-suite
 * test that protected the original duplication is still in place):
 *
 * - Strips a leading ```json or ``` (optionally followed by a newline) only
 *   when at the very START of the string (`^`-anchored regex)
 * - Strips a trailing ``` (optionally preceded by a newline) only at the END
 * - Trims the result
 * - Preserves mid-string ``` characters
 * - Whitespace BEFORE the leading fence prevents the strip (because of the
 *   `^` anchor — `.trim()` runs AFTER the replaces)
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}
