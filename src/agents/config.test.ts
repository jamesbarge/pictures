import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculateCost, validateEnvironment } from "./config";

describe("validateEnvironment", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
  });

  it("does not throw when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("throws when GEMINI_API_KEY is unset", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => validateEnvironment()).toThrow(/GEMINI_API_KEY/);
  });

  it("throws when GEMINI_API_KEY is empty string", () => {
    process.env.GEMINI_API_KEY = "";
    expect(() => validateEnvironment()).toThrow(/GEMINI_API_KEY/);
  });
});

describe("calculateCost", () => {
  it("computes cost for opus model based on input + output tokens", () => {
    // opus: input $0.015/1K, output $0.075/1K
    // 2K input + 1K output → 2 * 0.015 + 1 * 0.075 = 0.03 + 0.075 = 0.105
    const result = calculateCost("claude-opus-4-5-20251101", 2000, 1000);
    expect(result.estimatedCostUsd).toBeCloseTo(0.105, 4);
    expect(result.inputTokens).toBe(2000);
    expect(result.outputTokens).toBe(1000);
  });

  it("computes cost for sonnet model", () => {
    // sonnet: input $0.003/1K, output $0.015/1K
    // 1K + 1K = 0.003 + 0.015 = 0.018
    const result = calculateCost("claude-sonnet-4-20250514", 1000, 1000);
    expect(result.estimatedCostUsd).toBeCloseTo(0.018, 4);
  });

  it("computes cost for haiku model (cheapest)", () => {
    // haiku: input $0.0008/1K, output $0.004/1K
    // 1K + 1K = 0.0008 + 0.004 = 0.0048
    const result = calculateCost("claude-3-5-haiku-20241022", 1000, 1000);
    expect(result.estimatedCostUsd).toBeCloseTo(0.0048, 4);
  });

  it("returns zero cost for zero tokens", () => {
    const result = calculateCost("claude-opus-4-5-20251101", 0, 0);
    expect(result.estimatedCostUsd).toBe(0);
  });

  it("rounds to 4 decimal places", () => {
    // 1 input token of haiku = 0.0000008 — should round to 4dp
    const result = calculateCost("claude-3-5-haiku-20241022", 1, 0);
    // 1/1000 * 0.0008 = 0.0000008 → rounded to 4dp = 0
    expect(result.estimatedCostUsd).toBe(0);
    // 5000 input × 0.0008/1K = 0.004 → preserved
    const result2 = calculateCost("claude-3-5-haiku-20241022", 5000, 0);
    expect(result2.estimatedCostUsd).toBe(0.004);
  });

  it("scales linearly with token count", () => {
    const a = calculateCost("claude-opus-4-5-20251101", 1000, 500);
    const b = calculateCost("claude-opus-4-5-20251101", 2000, 1000);
    expect(b.estimatedCostUsd).toBeCloseTo(a.estimatedCostUsd * 2, 4);
  });

  it("opus is more expensive than sonnet which is more expensive than haiku for same tokens", () => {
    const tokens = { input: 1000, output: 1000 };
    const opus = calculateCost(
      "claude-opus-4-5-20251101",
      tokens.input,
      tokens.output,
    );
    const sonnet = calculateCost(
      "claude-sonnet-4-20250514",
      tokens.input,
      tokens.output,
    );
    const haiku = calculateCost(
      "claude-3-5-haiku-20241022",
      tokens.input,
      tokens.output,
    );
    expect(opus.estimatedCostUsd).toBeGreaterThan(sonnet.estimatedCostUsd);
    expect(sonnet.estimatedCostUsd).toBeGreaterThan(haiku.estimatedCostUsd);
  });
});
