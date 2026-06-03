/**
 * Tests for `stripCodeFences` from both src/lib/gemini.ts and src/lib/deepseek.ts.
 *
 * Both modules export identical implementations (DRY duplication noted in
 * the codebase — a future PR can extract to a shared helper). For now, this
 * test file pins the contract for BOTH so a refactor to consolidate them
 * doesn't silently change the behaviour of either caller.
 */
import { describe, expect, it } from "vitest";
import { stripCodeFences as stripCodeFencesGemini } from "./gemini";
import { stripCodeFences as stripCodeFencesDeepSeek } from "./deepseek";

// The two implementations are identical; run the same suite against both.
const SUITES: Array<[string, (s: string) => string]> = [
  ["gemini.stripCodeFences", stripCodeFencesGemini],
  ["deepseek.stripCodeFences", stripCodeFencesDeepSeek],
];

for (const [name, strip] of SUITES) {
  describe(name, () => {
    it("strips leading ```json fence and trailing ```", () => {
      const input = '```json\n{"foo": 1}\n```';
      expect(strip(input)).toBe('{"foo": 1}');
    });

    it("strips leading ``` (no language tag)", () => {
      const input = '```\n{"foo": 1}\n```';
      expect(strip(input)).toBe('{"foo": 1}');
    });

    it("strips ```json with no trailing newline before content", () => {
      const input = '```json{"foo": 1}```';
      expect(strip(input)).toBe('{"foo": 1}');
    });

    it("returns clean JSON unchanged (no fences present)", () => {
      expect(strip('{"foo": 1}')).toBe('{"foo": 1}');
    });

    it("does NOT strip a leading fence if there's whitespace before it (regex is ^-anchored)", () => {
      // Implementation: `.replace(/^\`\`\`(?:json)?\s*\n?/, "")` — `^` anchors to
      // the very start of the string, so whitespace BEFORE the fence prevents
      // the strip. Pinning this so a refactor doesn't accidentally introduce
      // pre-trim() that would silently change behaviour.
      const input = '  ```json\n{"x": 2}\n```  ';
      expect(strip(input)).toBe('```json\n{"x": 2}');
    });

    it("returns empty string for empty input", () => {
      expect(strip("")).toBe("");
    });

    it("returns whitespace-only input as empty after trim", () => {
      expect(strip("   \n  ")).toBe("");
    });

    it("preserves internal newlines in the fenced content", () => {
      const input = "```json\n{\n  \"a\": 1,\n  \"b\": 2\n}\n```";
      expect(strip(input)).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it("does NOT strip ``` that appears mid-string (only at start/end)", () => {
      const input = "```json\nbefore ``` middle\n```";
      // Leading fence stripped, trailing fence stripped, middle ``` preserved.
      expect(strip(input)).toBe("before ``` middle");
    });

    it("is idempotent when called twice on already-clean input", () => {
      const clean = '{"foo": 1}';
      expect(strip(strip(clean))).toBe(clean);
    });
  });
}
