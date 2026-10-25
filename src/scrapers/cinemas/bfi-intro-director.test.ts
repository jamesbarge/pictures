/**
 * 25 Oct 2026: BFI Southbank stored "Be My Baby" with directors
 * ["Be My Baby + intro by programmer Anton Bitel"]. The intro line is the
 * listing, not a credit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bfiDirectorCredit, createBFIScraper } from "./bfi";
import type { RawScreening } from "../types";

type SearchRow = unknown[];

const INTRO = "Be My Baby + intro by programmer Anton Bitel";

function southbankRow(title: string): SearchRow {
  const row: SearchRow = Array(70).fill(null);
  row[2] = "BFI Southbank";
  row[6] = title;
  row[8] = "18:10";
  row[9] = 8;
  row[10] = 10; // November, 0-indexed
  row[11] = 2026;
  row[18] = "https://whatson.bfi.org.uk/Online/default.asp?article=be-my-baby";
  row[64] = "Screen NFT1";
  return row;
}

function mapRows(rows: SearchRow[]): RawScreening[] {
  const scraper = createBFIScraper("bfi-southbank");
  return (scraper as unknown as { mapRows(r: SearchRow[]): RawScreening[] }).mapRows(rows);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T10:05:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BFI Southbank intro line, 25 Oct 2026", () => {
  it("stores Be My Baby without the intro line as a director", () => {
    const [screening] = mapRows([southbankRow(INTRO)]);
    expect(screening.filmTitle).toBe("Be My Baby");
    expect(screening.director).toBeUndefined();
    expect(screening.eventType).toBe("intro");
    expect(screening.datetime.toISOString()).toBe("2026-11-08T18:10:00.000Z");
  });

  it("drops a credit that is the raw listing or contains a colon or plus", () => {
    expect(bfiDirectorCredit(INTRO, INTRO)).toBeUndefined();
    expect(bfiDirectorCredit("Be My Baby + intro by programmer Anton Bitel", "Be My Baby")).toBeUndefined();
    expect(bfiDirectorCredit("Special preview: La Bola Negra", "Special preview: La Bola Negra")).toBeUndefined();
  });

  it("still reads a director from a comma-separated stats line", () => {
    const raw = "Greta Gerwig, USA, 2019, 135m.";
    const [screening] = mapRows([southbankRow(raw)]);
    expect(screening.director).toBe("Greta Gerwig");
    expect(bfiDirectorCredit("Anton Bitel", "Be My Baby")).toBe("Anton Bitel");
  });
});
