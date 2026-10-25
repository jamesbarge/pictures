/**
 * 24 Oct 2026: BFI IMAX stored
 * "Special preview: La Bola Negra" with directors equal to that whole string,
 * and "BFI IMAX exclusive preview: Godzilla Minus Zero" as its own film.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBFIScraper } from "./bfi";
import type { RawScreening } from "../types";

type SearchRow = unknown[];

function imaxRow(title: string, day: number): SearchRow {
  const row: SearchRow = Array(70).fill(null);
  row[2] = "IMAX";
  row[6] = title;
  row[8] = "20:30";
  row[9] = day;
  row[10] = 10; // November, 0-indexed
  row[11] = 2026;
  row[18] = "https://whatson.bfi.org.uk/imax/Online/default.asp?article=preview";
  row[64] = "Laser - 2023 - NEW BFI IMAX - Big Screen WITH VIP SEATING";
  return row;
}

function mapRows(rows: SearchRow[]): RawScreening[] {
  const scraper = createBFIScraper("bfi-imax");
  return (scraper as unknown as { mapRows(r: SearchRow[]): RawScreening[] }).mapRows(rows);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T10:10:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BFI IMAX preview titles, 24 Oct 2026", () => {
  it("does not copy 'Special preview: La Bola Negra' into directors", () => {
    const [screening] = mapRows([imaxRow("Special preview: La Bola Negra", 4)]);
    expect(screening.filmTitle).toBe("Special preview: La Bola Negra");
    expect(screening.director).toBeUndefined();
    expect(screening.eventType).toBe("preview");
    expect(screening.datetime.toISOString()).toBe("2026-11-04T20:30:00.000Z");
  });

  it("does not invent a director for the Godzilla preview line", () => {
    const [screening] = mapRows([imaxRow("BFI IMAX exclusive preview: Godzilla Minus Zero", 2)]);
    expect(screening.filmTitle).toBe("BFI IMAX exclusive preview: Godzilla Minus Zero");
    expect(screening.director).toBeUndefined();
    expect(screening.eventType).toBe("preview");
  });

  it("still reads a director from a comma-separated stats line", () => {
    const [screening] = mapRows([imaxRow("Greta Gerwig, USA, 2019, 135m.", 2)]);
    expect(screening.director).toBe("Greta Gerwig");
  });
});
