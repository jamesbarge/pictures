import { describe, it, expect } from "vitest";
import {
  sanitizeScreening,
  validateScreenings,
} from "./screening-validator";
import type { RawScreening } from "../types";

function makeScreening(overrides: Partial<RawScreening> = {}): RawScreening {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2 PM — always within valid screening hours
  return {
    filmTitle: "Test Film",
    datetime: tomorrow,
    bookingUrl: "https://example.com/book",
    ...overrides,
  };
}

describe("sanitizeScreening", () => {
  it("should strip HTML tags from film titles", () => {
    const screening = makeScreening({
      filmTitle: "<b>Bold</b> Title",
    });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe("Bold Title");
  });

  it("should strip script tags from film titles", () => {
    const screening = makeScreening({
      filmTitle: 'Film <script>alert("xss")</script>',
    });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe('Film alert("xss")');
  });

  it("should handle titles with no HTML", () => {
    const screening = makeScreening({ filmTitle: "Normal Title" });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe("Normal Title");
  });

  it("should trim whitespace after stripping tags", () => {
    const screening = makeScreening({
      filmTitle: "  <em>Italic</em>  ",
    });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe("Italic");
  });

  it("should preserve other screening fields", () => {
    const screening = makeScreening({
      filmTitle: "<b>Film</b>",
      format: "35mm",
      screen: "Screen 1",
    });
    const result = sanitizeScreening(screening);
    expect(result.format).toBe("35mm");
    expect(result.screen).toBe("Screen 1");
  });

  it("should strip HTML from all text fields", () => {
    const screening = makeScreening({
      filmTitle: "<b>Test</b> Film",
      eventDescription: "<p>A special <em>screening</em></p>",
      screen: "Screen <br/>1",
      format: "<span>35mm</span>",
      director: "<a href='x'>Christopher Nolan</a>",
    });
    const sanitized = sanitizeScreening(screening);
    expect(sanitized.filmTitle).toBe("Test Film");
    expect(sanitized.eventDescription).toBe("A special screening");
    expect(sanitized.screen).toBe("Screen 1");
    expect(sanitized.format).toBe("35mm");
    expect(sanitized.director).toBe("Christopher Nolan");
  });

  it("should not add undefined fields when optional fields are missing", () => {
    const screening = makeScreening({
      filmTitle: "<b>Film</b>",
    });
    const sanitized = sanitizeScreening(screening);
    expect(sanitized.filmTitle).toBe("Film");
    expect(sanitized.eventDescription).toBeUndefined();
    expect(sanitized.screen).toBeUndefined();
    expect(sanitized.format).toBeUndefined();
    expect(sanitized.director).toBeUndefined();
  });
});

describe("validateScreenings sanitization", () => {
  it("should sanitize valid screenings in the pipeline", () => {
    const screenings = [
      makeScreening({ filmTitle: "<b>Bold Film</b>" }),
      makeScreening({ filmTitle: "Clean Title" }),
    ];
    const { validScreenings } = validateScreenings(screenings);
    expect(validScreenings).toHaveLength(2);
    expect(validScreenings[0].filmTitle).toBe("Bold Film");
    expect(validScreenings[1].filmTitle).toBe("Clean Title");
  });
});
