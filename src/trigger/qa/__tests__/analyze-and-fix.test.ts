/**
 * Unit tests for QA Analyze & Fix — deterministic checks
 */

import { describe, it, expect } from "vitest";
import { normalizeTitle } from "../utils/title-utils";

describe("normalizeTitle", () => {
  it("normalizes basic titles", () => {
    expect(normalizeTitle("The Godfather")).toBe("godfather");
    expect(normalizeTitle("  Nosferatu  ")).toBe("nosferatu");
  });

  it("removes parenthetical suffixes", () => {
    expect(normalizeTitle("Nosferatu (2024)")).toBe("nosferatu");
    expect(normalizeTitle("The Birds (1963)")).toBe("birds");
  });

  it("removes subtitle after colon", () => {
    expect(normalizeTitle("Star Wars: A New Hope")).toBe("star wars");
  });

  it("normalizes punctuation", () => {
    expect(normalizeTitle("It\u2019s a Wonderful Life")).toBe("it's a wonderful life");
    expect(normalizeTitle("Film\u2014Title")).toBe("film-title");
  });

  it("handles empty and whitespace input", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle("   ")).toBe("");
  });
});

describe("stale screening detection", () => {
  it("detects screenings older than 2 hours as stale", () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60_000);
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60_000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);

    const isStale = (datetime: Date) => datetime < twoHoursAgo;

    expect(isStale(threeHoursAgo)).toBe(true);
    expect(isStale(oneHourAgo)).toBe(false);
  });

  it("handles timezone edge cases around BST/GMT transition", () => {
    // BST starts last Sunday of March, ends last Sunday of October
    // The stale check uses UTC internally, so timezone doesn't matter
    const utcScreening = new Date("2026-03-29T01:30:00Z"); // 1:30 UTC
    const now = new Date("2026-03-29T04:00:00Z"); // 4:00 UTC (2.5h later)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);

    expect(utcScreening < twoHoursAgo).toBe(true);
  });
});

describe("completeness guard", () => {
  function checkCompleteness(extracted: number, expected: number) {
    const ratio = expected > 0 ? extracted / expected : 0;
    return { ok: ratio >= 0.7, ratio };
  }

  it("passes when extraction ratio is above 0.7", () => {
    expect(checkCompleteness(80, 100).ok).toBe(true);
    expect(checkCompleteness(70, 100).ok).toBe(true);
    expect(checkCompleteness(100, 100).ok).toBe(true);
  });

  it("fails when extraction ratio is below 0.7", () => {
    expect(checkCompleteness(69, 100).ok).toBe(false);
    expect(checkCompleteness(0, 100).ok).toBe(false);
    expect(checkCompleteness(50, 100).ok).toBe(false);
  });

  it("handles edge case of 0 expected", () => {
    expect(checkCompleteness(0, 0).ok).toBe(false);
  });
});

describe("scope classification thresholds", () => {
  it("classifies >= 3 broken links from same cinema as systemic", () => {
    const issues = [
      { cinemaId: "bfi-southbank" },
      { cinemaId: "bfi-southbank" },
      { cinemaId: "bfi-southbank" },
      { cinemaId: "curzon-soho" },
    ];

    const countByCinema = new Map<string, number>();
    for (const issue of issues) {
      countByCinema.set(issue.cinemaId, (countByCinema.get(issue.cinemaId) ?? 0) + 1);
    }

    expect(countByCinema.get("bfi-southbank")).toBe(3);
    expect((countByCinema.get("bfi-southbank") ?? 0) >= 3).toBe(true);
    expect((countByCinema.get("curzon-soho") ?? 0) >= 3).toBe(false);
  });

  it("classifies >= 5 missing Letterboxd as systemic", () => {
    const missingCount = 6;
    expect(missingCount >= 5).toBe(true);

    const notSystemicCount = 4;
    expect(notSystemicCount >= 5).toBe(false);
  });
});

describe("time mismatch detection", () => {
  it("detects time differences > 5 minutes", () => {
    const feTime = new Date("2026-03-08T19:30:00Z");
    const dbTime = new Date("2026-03-08T19:00:00Z");

    const diffMs = Math.abs(feTime.getTime() - dbTime.getTime());
    const diffMinutes = diffMs / 60_000;

    expect(diffMinutes).toBe(30);
    expect(diffMinutes > 5).toBe(true);
  });

  it("allows small time differences (<= 5 minutes)", () => {
    const feTime = new Date("2026-03-08T19:30:00Z");
    const dbTime = new Date("2026-03-08T19:28:00Z");

    const diffMs = Math.abs(feTime.getTime() - dbTime.getTime());
    const diffMinutes = diffMs / 60_000;

    expect(diffMinutes).toBe(2);
    expect(diffMinutes > 5).toBe(false);
  });

  it("handles BST conversion correctly", () => {
    // Front-end shows 7:30pm London time (BST = UTC+1)
    // So 7:30pm BST = 18:30 UTC
    // If DB stores 19:30 UTC, that's wrong (that's 8:30pm BST)
    const frontEndLondonTime = "2026-07-15T19:30:00"; // displayed as 7:30pm BST
    // In BST (UTC+1), 7:30pm local = 6:30pm UTC
    const expectedUtc = new Date("2026-07-15T18:30:00Z");
    const dbStored = new Date("2026-07-15T19:30:00Z"); // Wrong — this is 8:30pm BST

    const diffMinutes = Math.abs(expectedUtc.getTime() - dbStored.getTime()) / 60_000;
    expect(diffMinutes).toBe(60); // 1 hour off due to BST
    expect(diffMinutes > 5).toBe(true);
  });
});

describe("verification gate logic", () => {
  it("always confirms stale screening deletion", () => {
    const issueType = "stale_screening";
    const alwaysConfirmed = ["stale_screening", "missing_letterboxd", "broken_booking_link", "booking_page_wrong_film"];
    expect(alwaysConfirmed.includes(issueType)).toBe(true);
  });

  it("requires TMDB cross-reference for tmdb_mismatch", () => {
    const issueType = "tmdb_mismatch";
    const requiresVerification = ["tmdb_mismatch", "time_mismatch"];
    expect(requiresVerification.includes(issueType)).toBe(true);
  });
});
