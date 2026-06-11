import { describe, expect, it } from "vitest";

import { z } from "zod";

import {
  boundedSyncArray,
  idsMissingFrom,
  MAX_FESTIVAL_SYNC_ITEMS,
  MAX_FILM_STATUS_SYNC_ITEMS,
  newestByKey,
} from "./sync-batching";

describe("sync batching helpers", () => {
  it("keeps the newest duplicate for each conflict key", () => {
    const result = newestByKey(
      [
        { id: "a", value: "old", updatedAt: "2026-06-09T10:00:00.000Z" },
        { id: "b", value: "only", updatedAt: "2026-06-09T11:00:00.000Z" },
        { id: "a", value: "new", updatedAt: "2026-06-09T12:00:00.000Z" },
      ],
      (item) => item.id,
      (item) => item.updatedAt,
    );

    expect(result).toEqual([
      { id: "a", value: "new", updatedAt: "2026-06-09T12:00:00.000Z" },
      { id: "b", value: "only", updatedAt: "2026-06-09T11:00:00.000Z" },
    ]);
  });

  it("uses the later item when duplicate timestamps are equal", () => {
    const result = newestByKey(
      [
        { id: "a", value: "first", updatedAt: "2026-06-09T10:00:00.000Z" },
        { id: "a", value: "second", updatedAt: "2026-06-09T10:00:00.000Z" },
      ],
      (item) => item.id,
      (item) => item.updatedAt,
    );

    expect(result[0].value).toBe("second");
  });

  it("finds server IDs absent from the client in linear time", () => {
    expect(idsMissingFrom(["a", "b", "c"], ["b", "c", "d"])).toEqual(["a"]);
  });

  it("sets a conservative shared request bound", () => {
    expect(MAX_FESTIVAL_SYNC_ITEMS).toBe(500);
    expect(MAX_FILM_STATUS_SYNC_ITEMS).toBe(5000);
    const schema = boundedSyncArray(z.string());
    expect(
      schema.safeParse(Array.from({ length: MAX_FESTIVAL_SYNC_ITEMS }, () => "item")).success,
    ).toBe(true);
    expect(
      schema.safeParse(Array.from({ length: MAX_FESTIVAL_SYNC_ITEMS + 1 }, () => "item")).success,
    ).toBe(false);
  });
});
