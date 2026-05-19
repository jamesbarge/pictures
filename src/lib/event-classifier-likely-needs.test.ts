/**
 * Tests for `likelyNeedsClassification` from src/lib/event-classifier.ts.
 *
 * Separate test file (rather than event-classifier.test.ts) because the
 * classifier itself needs Gemini mocks. This file tests only the pure
 * heuristic gate function.
 */
import { describe, expect, it } from "vitest";
import { likelyNeedsClassification } from "./event-classifier";

describe("likelyNeedsClassification", () => {
  it("returns false for a plain film title", () => {
    expect(likelyNeedsClassification("Vertigo")).toBe(false);
    expect(likelyNeedsClassification("The Lord of the Rings")).toBe(false);
  });

  // Q&A variants
  it.each([
    ["Anatomy of a Fall + Q&A", true],
    ["The Brutalist Q & A", true],
    ["X + q&a", true],
  ])("Q&A pattern: %j → %j", (input, expected) => {
    expect(likelyNeedsClassification(input)).toBe(expected);
  });

  // Format variants
  it.each([
    ["The Shining 35mm", true],
    ["2001 70mm IMAX", true],
    ["Inception IMAX", true],
    ["Vertigo 4K Restoration", true],
    ["Avatar 3D", true],
  ])("format pattern: %j → %j", (input, expected) => {
    expect(likelyNeedsClassification(input)).toBe(expected);
  });

  // Event variants
  it.each([
    ["UK Premiere: Saltburn", true],
    ["Sneak Preview", true],
    ["Saint Maud Sing-A-Long", true],
    ["Mamma Mia Singalong", true],
    ["Pulp Fiction + Reservoir Dogs Double Bill", true],
    ["The Marathon", true],
  ])("event-type pattern: %j → %j", (input, expected) => {
    expect(likelyNeedsClassification(input)).toBe(expected);
  });

  // Accessibility variants
  it.each([
    ["Frozen Relaxed Screening", true],
    ["Citizen Kane with Subtitles", true],
    ["Casablanca audio described", true],
  ])("accessibility pattern: %j → %j", (input, expected) => {
    expect(likelyNeedsClassification(input)).toBe(expected);
  });

  // Repertory/season variants
  it.each([
    ["Vertigo + Intro by Critic", true],
    ["Saltburn + Discussion", true],
    ["The Brutalist 30th Anniversary", true],
    ["Saint Maud (4K Restoration)", true],
    ["Kurosawa Season: Ran", true],
    ["Studio Ghibli Retrospective", true],
  ])("repertory/season pattern: %j → %j", (input, expected) => {
    expect(likelyNeedsClassification(input)).toBe(expected);
  });

  it("is case-insensitive (regex flags include /i)", () => {
    expect(likelyNeedsClassification("ANATOMY OF A FALL + Q&A")).toBe(true);
    expect(likelyNeedsClassification("THE SHINING 35MM")).toBe(true);
  });

  it("requires word-boundary matches (does NOT fire on substrings)", () => {
    // `\b3d\b` requires word boundaries — should NOT match the literal "3d"
    // embedded in "in-3deed" or similar non-format mentions.
    expect(likelyNeedsClassification("The In-3deed Hour")).toBe(false);
    expect(likelyNeedsClassification("Imax3D")).toBe(false); // no word boundary
  });

  it("returns true for an empty string only if a pattern matches (no false-positives)", () => {
    expect(likelyNeedsClassification("")).toBe(false);
  });
});
