import { describe, expect, it } from "vitest";
import {
  noteWithoutStrayQuote,
  restoredAlkerSourceId,
} from "./listings-qa-2026-11-13";

describe("13 Nov 2026 listings QA repair helpers", () => {
  it("drops the stray quote the anniversary note inherited", () => {
    expect(noteWithoutStrayQuote("' (35th Anniversary)")).toBe("(35th Anniversary)");
    expect(noteWithoutStrayQuote("' (50th Anniversary)")).toBe("(50th Anniversary)");
    expect(noteWithoutStrayQuote("Also: anniversary")).toBeNull();
    expect(noteWithoutStrayQuote(null)).toBeNull();
  });

  it("rewrites only a source id that ends in the truncated title", () => {
    expect(restoredAlkerSourceId("close-up-search-2026-11-27T20:15:00.000Z-alker")).toBe(
      "close-up-search-2026-11-27T20:15:00.000Z-stalker",
    );
    expect(restoredAlkerSourceId("close-up-900-2026-11-20T20:15:00.000Z")).toBe(
      "close-up-900-2026-11-20T20:15:00.000Z",
    );
  });
});
