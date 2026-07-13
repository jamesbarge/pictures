import { describe, expect, it, vi } from "vitest";

// The script imports the pipeline (which pulls in the DB client); mock the
// heavy modules so the pure helpers can be tested without a connection.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ films: {}, screenings: {} }));
vi.mock("@/scrapers/pipeline", () => ({
  processScreenings: vi.fn(),
  normalizeTitle: (t: string) =>
    t
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/^the\s+/i, "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim(),
}));

import { normalizeVenueName, titlesMatch, isCovered } from "./lcut-gapfill";

describe("normalizeVenueName", () => {
  it("strips the pride flag emoji from The Arzner", () => {
    expect(normalizeVenueName("The Arzner 🏳️‍🌈")).toBe("the arzner");
  });

  it("strips diacritics from Ciné Lumière", () => {
    expect(normalizeVenueName("Ciné Lumière")).toBe("cine lumiere");
  });

  it("keeps hyphenated names intact", () => {
    expect(normalizeVenueName("Close-Up Film Centre")).toBe("close-up film centre");
  });
});

describe("titlesMatch", () => {
  it("matches identical normalized titles", () => {
    expect(titlesMatch("apocalypse now", "apocalypse now")).toBe(true);
  });

  it("matches containment for longer titles (version suffixes)", () => {
    expect(titlesMatch("apocalypse now", "apocalypse now final cut")).toBe(true);
  });

  it("does not match short-title containment (It vs It Follows)", () => {
    expect(titlesMatch("it", "it follows")).toBe(false);
  });

  it("does not match unrelated titles", () => {
    expect(titlesMatch("the birds", "the birds placebo")).toBe(true); // containment is intentional here
    expect(titlesMatch("vertigo", "psycho")).toBe(false);
  });
});

describe("isCovered", () => {
  const base = new Date("2026-07-16T18:00:00.000Z");
  const probe = {
    normTitle: "vive le punk",
    datetime: base,
    sourceId: "lcut-abc123",
  };

  it("covered when an existing screening matches title within ±20 min", () => {
    const existing = [
      {
        datetime: new Date(base.getTime() + 15 * 60 * 1000),
        normTitle: "vive le punk",
        sourceId: "horse-hospital-1",
      },
    ];
    expect(isCovered(probe, existing)).toBe(true);
  });

  it("not covered when the time gap exceeds 20 minutes", () => {
    const existing = [
      {
        datetime: new Date(base.getTime() + 45 * 60 * 1000),
        normTitle: "vive le punk",
        sourceId: "horse-hospital-1",
      },
    ];
    expect(isCovered(probe, existing)).toBe(false);
  });

  it("not covered when only the time matches but titles differ", () => {
    const existing = [
      { datetime: base, normTitle: "stalker", sourceId: "x-1" },
    ];
    expect(isCovered(probe, existing)).toBe(false);
  });

  it("covered when the lcut sourceId already exists (prior gap-fill run)", () => {
    const existing = [
      {
        datetime: new Date(base.getTime() + 6 * 60 * 60 * 1000),
        normTitle: "something else entirely",
        sourceId: "lcut-abc123",
      },
    ];
    expect(isCovered(probe, existing)).toBe(true);
  });

  it("not covered when there are no existing screenings", () => {
    expect(isCovered(probe, [])).toBe(false);
  });
});
