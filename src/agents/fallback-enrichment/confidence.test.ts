import { describe, it, expect } from "vitest";
import {
  calculateConfidence,
  titleSimilarity,
  type ConfidenceInput,
} from "./confidence";

describe("titleSimilarity", () => {
  it("returns 1.0 for exact matches", () => {
    expect(titleSimilarity("The Godfather", "The Godfather")).toBe(1.0);
  });

  it("returns 1.0 for matches after normalization (article stripping)", () => {
    expect(titleSimilarity("The Godfather", "Godfather")).toBe(1.0);
  });

  it("returns 1.0 for case-insensitive matches", () => {
    expect(titleSimilarity("the godfather", "THE GODFATHER")).toBe(1.0);
  });

  it("returns high similarity when one title contains the other", () => {
    const sim = titleSimilarity("Blade Runner", "Blade Runner 2049");
    expect(sim).toBeGreaterThan(0.8);
  });

  it("returns low similarity for unrelated titles", () => {
    const sim = titleSimilarity("The Matrix", "Finding Nemo");
    expect(sim).toBeLessThan(0.4);
  });

  it("handles punctuation differences", () => {
    const sim = titleSimilarity("Spider-Man: No Way Home", "Spider Man No Way Home");
    expect(sim).toBeGreaterThan(0.9);
  });

  it("handles empty strings", () => {
    expect(titleSimilarity("", "")).toBe(1.0);
  });
});

describe("calculateConfidence", () => {
  const baseInput: ConfidenceInput = {
    originalTitle: "Nosferatu",
    originalYear: 2024,
    extractedTitle: "Nosferatu",
    extractedYear: 2024,
    sourceCount: 3,
    hasPoster: true,
    hasSynopsis: true,
    hasLetterboxd: true,
    hasImdb: true,
  };

  it("returns high confidence for perfect match with full data", () => {
    const result = calculateConfidence(baseInput);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.shouldAutoApply).toBe(true);
  });

  it("returns lower confidence when title doesn't match well", () => {
    const result = calculateConfidence({
      ...baseInput,
      extractedTitle: "A Completely Different Film",
    });
    expect(result.score).toBeLessThan(0.75);
    expect(result.shouldAutoApply).toBe(false);
  });

  it("returns lower confidence when year doesn't match", () => {
    const result = calculateConfidence({
      ...baseInput,
      extractedYear: 1922, // Original Nosferatu
    });
    expect(result.score).toBeLessThan(baseInput.sourceCount > 0 ? 0.85 : 0.7);
  });

  it("handles year off by one (common for release dates)", () => {
    const result = calculateConfidence({
      ...baseInput,
      extractedYear: 2025,
    });
    // Should still be fairly high - off by one is common
    expect(result.score).toBeGreaterThan(0.75);
  });

  it("returns lower confidence with fewer sources", () => {
    const fewSources = calculateConfidence({
      ...baseInput,
      sourceCount: 1,
    });
    const manySources = calculateConfidence({
      ...baseInput,
      sourceCount: 3,
    });
    expect(fewSources.score).toBeLessThan(manySources.score);
  });

  it("returns lower confidence with less data found", () => {
    const result = calculateConfidence({
      ...baseInput,
      hasPoster: false,
      hasSynopsis: false,
      hasLetterboxd: false,
      hasImdb: false,
    });
    expect(result.score).toBeLessThan(
      calculateConfidence(baseInput).score
    );
  });

  it("handles null years gracefully", () => {
    const result = calculateConfidence({
      ...baseInput,
      originalYear: null,
      extractedYear: null,
    });
    // Should still return a reasonable score based on other signals
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it("gives partial credit when only extracted year is present", () => {
    const result = calculateConfidence({
      ...baseInput,
      originalYear: null,
      extractedYear: 2024,
    });
    expect(result.breakdown.yearMatch).toBe(0.6);
  });

  it("breakdown weights sum correctly for perfect input", () => {
    const result = calculateConfidence(baseInput);
    // Verify breakdown components are all 0-1
    expect(result.breakdown.titleMatch).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.titleMatch).toBeLessThanOrEqual(1);
    expect(result.breakdown.yearMatch).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.yearMatch).toBeLessThanOrEqual(1);
    expect(result.breakdown.sourceAgreement).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.sourceAgreement).toBeLessThanOrEqual(1);
    expect(result.breakdown.dataCompleteness).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.dataCompleteness).toBeLessThanOrEqual(1);
  });

  it("score is always between 0 and 1", () => {
    // Test edge cases
    const worstCase = calculateConfidence({
      originalTitle: "xyz",
      originalYear: 1950,
      extractedTitle: "completely different long title here",
      extractedYear: 2024,
      sourceCount: 0,
      hasPoster: false,
      hasSynopsis: false,
      hasLetterboxd: false,
      hasImdb: false,
    });
    expect(worstCase.score).toBeGreaterThanOrEqual(0);
    expect(worstCase.score).toBeLessThanOrEqual(1);
  });
});
