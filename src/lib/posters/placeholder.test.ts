import { describe, expect, it } from "vitest";
import {
  generatePosterPlaceholder,
  getPosterPlaceholderDataUrl,
  getPosterPlaceholderUrl,
} from "./placeholder";

describe("generatePosterPlaceholder", () => {
  it("returns a valid SVG string", () => {
    const svg = generatePosterPlaceholder("Vertigo");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("embeds the title in the SVG output", () => {
    const svg = generatePosterPlaceholder("Vertigo");
    expect(svg).toContain("Vertigo");
  });

  it("embeds the year when provided", () => {
    const svg = generatePosterPlaceholder("Vertigo", 1958);
    expect(svg).toContain("1958");
  });

  it("omits year markup when year is null", () => {
    const svgWithYear = generatePosterPlaceholder("Vertigo", 1958);
    const svgWithoutYear = generatePosterPlaceholder("Vertigo");
    expect(svgWithYear).toContain("1958");
    expect(svgWithoutYear).not.toContain("1958");
  });

  it("escapes XML-special characters in titles (& < >)", () => {
    const svg = generatePosterPlaceholder("Salt & Pepper");
    // Should NOT contain a raw & followed by a non-entity (would break XML).
    expect(svg).toContain("Salt &amp; Pepper");
    expect(svg).not.toContain("Salt & Pepper</");
  });

  it("is deterministic for the same input (cacheable output)", () => {
    const a = generatePosterPlaceholder("The Brutalist", 2024);
    const b = generatePosterPlaceholder("The Brutalist", 2024);
    expect(a).toBe(b);
  });

  it("returns different SVGs for different titles", () => {
    const a = generatePosterPlaceholder("A");
    const b = generatePosterPlaceholder("B");
    expect(a).not.toBe(b);
  });
});

describe("getPosterPlaceholderDataUrl", () => {
  it("returns a base64-encoded data URL with correct mime type", () => {
    const url = getPosterPlaceholderDataUrl("Vertigo");
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("decodes back to a valid SVG", () => {
    const url = getPosterPlaceholderDataUrl("Vertigo", 1958);
    const base64 = url.split(",")[1];
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    expect(decoded.startsWith("<svg")).toBe(true);
    expect(decoded).toContain("Vertigo");
    expect(decoded).toContain("1958");
  });
});

describe("getPosterPlaceholderUrl", () => {
  it("returns a /api/poster-placeholder URL with title param", () => {
    expect(getPosterPlaceholderUrl("Vertigo")).toBe(
      "/api/poster-placeholder?title=Vertigo",
    );
  });

  it("URL-encodes special chars in title (URLSearchParams default)", () => {
    expect(getPosterPlaceholderUrl("Salt & Pepper")).toBe(
      "/api/poster-placeholder?title=Salt+%26+Pepper",
    );
  });

  it("includes year when provided", () => {
    expect(getPosterPlaceholderUrl("Vertigo", 1958)).toBe(
      "/api/poster-placeholder?title=Vertigo&year=1958",
    );
  });

  it("omits year query param when null", () => {
    expect(getPosterPlaceholderUrl("Vertigo", null)).toBe(
      "/api/poster-placeholder?title=Vertigo",
    );
  });

  it("omits year query param when undefined", () => {
    expect(getPosterPlaceholderUrl("Vertigo")).toBe(
      "/api/poster-placeholder?title=Vertigo",
    );
  });
});
