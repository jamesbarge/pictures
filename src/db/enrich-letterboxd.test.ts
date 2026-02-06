import { describe, expect, it } from "vitest";

import {
  buildTitleCandidates,
  isLikelyEvent,
  parseRatingWithVerification,
} from "./enrich-letterboxd";

describe("buildTitleCandidates", () => {
  it("extracts useful variants from noisy programming titles", () => {
    const candidates = buildTitleCandidates("UK PREMIERE MACDO");
    expect(candidates).toContain("MACDO");
  });

  it("keeps short canonical title when alternate title is in parentheses", () => {
    const candidates = buildTitleCandidates(
      "Amelie (Le fabuleux destin d'Amélie Poulain)"
    );

    expect(candidates).toContain("Amelie");
  });

  it("strips partnership suffix", () => {
    const candidates = buildTitleCandidates(
      "My Father's Shadow in association with We Are Parable"
    );

    expect(candidates).toContain("My Father's Shadow");
  });
});

describe("parseRatingWithVerification", () => {
  const baseHtml = `
    <html>
      <head>
        <meta property="og:title" content="Miss Congeniality (2000)" />
        <meta name="twitter:data2" content="3.40 out of 5" />
      </head>
    </html>
  `;

  it("parses valid rating metadata", () => {
    const parsed = parseRatingWithVerification(
      baseHtml,
      "https://letterboxd.com/film/miss-congeniality/",
      2000
    );

    expect(parsed).toEqual({
      rating: 3.4,
      url: "https://letterboxd.com/film/miss-congeniality/",
    });
  });

  it("supports 'out of 5 stars' format", () => {
    const html = baseHtml.replace("3.40 out of 5", "3.40 out of 5 stars");
    const parsed = parseRatingWithVerification(
      html,
      "https://letterboxd.com/film/miss-congeniality/",
      2000
    );

    expect(parsed?.rating).toBe(3.4);
  });

  it("rejects mismatched year", () => {
    const parsed = parseRatingWithVerification(
      baseHtml,
      "https://letterboxd.com/film/miss-congeniality/",
      1990
    );

    expect(parsed).toBeNull();
  });
});

describe("isLikelyEvent", () => {
  it("flags event-style titles", () => {
    expect(isLikelyEvent("Apocalypse Now + Q&A")).toBe(true);
  });

  it("does not flag normal film titles", () => {
    expect(isLikelyEvent("Miss Congeniality")).toBe(false);
  });
});
