/**
 * Tests for the cursor-pagination primitives in src/db/repositories/screening.ts.
 *
 * Separate from screening.test.ts because that file tests the integration
 * with Drizzle; here we focus on the pure parseCursor/buildCursor pair.
 */
import { describe, expect, it } from "vitest";
import { buildCursor, parseCursor } from "./screening";

describe("parseCursor", () => {
  it("splits at the LAST underscore — UUID is right of split", () => {
    const result = parseCursor("2026-05-18T19:30:00.000Z_abc-123-uuid");
    expect(result).toEqual({
      datetime: "2026-05-18T19:30:00.000Z",
      id: "abc-123-uuid",
    });
  });

  it("returns null when the cursor has no underscore", () => {
    expect(parseCursor("nounderscorehere")).toBeNull();
  });

  it("returns null when datetime portion is empty", () => {
    expect(parseCursor("_abc")).toBeNull();
  });

  it("returns null when id portion is empty", () => {
    expect(parseCursor("2026-05-18T19:30:00.000Z_")).toBeNull();
  });

  it("returns null when datetime portion is unparseable", () => {
    expect(parseCursor("not-a-date_abc-uuid")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseCursor("")).toBeNull();
  });

  it("uses lastIndexOf — handles UUIDs containing underscores in the datetime portion (unusual but pin)", () => {
    // ISO datetimes don't contain underscores, but if a datetime were somehow
    // to include one, the LAST underscore wins (so the UUID part stays intact).
    // We pin the behaviour: the cursor format treats everything-up-to-last-_
    // as datetime, after-last-_ as id.
    const result = parseCursor("2026-05-18T19:30:00_foo_bar-uuid");
    // Date.parse("2026-05-18T19:30:00_foo") returns NaN, so this becomes null.
    expect(result).toBeNull();
  });
});

describe("buildCursor", () => {
  it("formats as '<ISO datetime>_<id>'", () => {
    const screening = {
      id: "abc-uuid-123",
      datetime: new Date("2026-05-18T19:30:00.000Z"),
    };
    // Use unknown cast — the function only reads datetime + id, so a partial
    // ScreeningWithDetails is fine for testing the formatter contract.
    expect(buildCursor(screening as unknown as Parameters<typeof buildCursor>[0])).toBe(
      "2026-05-18T19:30:00.000Z_abc-uuid-123",
    );
  });
});

describe("parseCursor + buildCursor roundtrip", () => {
  it("preserves datetime + id through build → parse", () => {
    const original = {
      id: "abc-uuid-123",
      datetime: new Date("2026-05-18T19:30:00.000Z"),
    };
    const cursor = buildCursor(original as unknown as Parameters<typeof buildCursor>[0]);
    const parsed = parseCursor(cursor);
    expect(parsed).toEqual({
      datetime: "2026-05-18T19:30:00.000Z",
      id: "abc-uuid-123",
    });
  });

  it("preserves datetime + id even when id contains hyphens (UUID-style)", () => {
    const original = {
      id: "00000000-0000-0000-0000-000000000000",
      datetime: new Date("2026-01-01T00:00:00.000Z"),
    };
    const cursor = buildCursor(original as unknown as Parameters<typeof buildCursor>[0]);
    const parsed = parseCursor(cursor);
    expect(parsed?.id).toBe("00000000-0000-0000-0000-000000000000");
  });
});
