import { describe, it, expect } from "vitest";
import { parseFilmMetadata } from "./metadata-parser";

describe("parseFilmMetadata — director validation", () => {
  it("accepts valid director names", () => {
    expect(parseFilmMetadata("Christopher Nolan, USA, 2023, 180m").director).toBe("Christopher Nolan");
  });

  it("accepts ALL CAPS director with 2-3 words", () => {
    expect(parseFilmMetadata("JEAN-LUC GODARD, France, 1965, 87m").director).toBe("JEAN-LUC GODARD");
  });

  it("rejects Screen NFT venue names", () => {
    expect(parseFilmMetadata("Screen NFT1, 2024, 90 mins").director).toBeUndefined();
  });

  it("rejects IMAX screen identifiers", () => {
    expect(parseFilmMetadata("IMAX Screen 2, 2024, 120 mins").director).toBeUndefined();
  });

  it("rejects EDUCATION LEARNING SPACES", () => {
    expect(parseFilmMetadata("EDUCATION LEARNING SPACES ROOM, 2024, 90 mins").director).toBeUndefined();
  });

  it("rejects ALL CAPS with 4+ words (venue names)", () => {
    expect(parseFilmMetadata("BLUE ROOM STUDIO SPACE ONE, 2024, 90 mins").director).toBeUndefined();
  });

  it("rejects strings with day-of-week (schedule text)", () => {
    expect(parseFilmMetadata("Monday 28 April 2026, 90 mins").director).toBeUndefined();
  });

  it("rejects strings with time patterns (schedule text)", () => {
    expect(parseFilmMetadata("Film + intro 20:45, 2024, 90 mins").director).toBeUndefined();
  });

  it("still extracts director from 'dir.' pattern", () => {
    expect(parseFilmMetadata("dir. Frank Capra, USA, 1946, 117 mins.").director).toBe("Frank Capra");
  });

  it("still extracts director from 'directed by' pattern", () => {
    expect(parseFilmMetadata("directed by Denis Villeneuve, 2024, 166 mins").director).toBe("Denis Villeneuve");
  });
});
