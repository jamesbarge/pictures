import { describe, expect, it } from "vitest";
import { getSpecialFormat, POSTER_BLUR_PLACEHOLDER } from "./constants";

describe("POSTER_BLUR_PLACEHOLDER", () => {
  it("is a valid base64 data URL for a PNG image", () => {
    expect(POSTER_BLUR_PLACEHOLDER).toMatch(/^data:image\/png;base64,/);
  });

  it("decodes to a non-empty buffer (no truncation)", () => {
    const b64 = POSTER_BLUR_PLACEHOLDER.split(",")[1];
    const buf = Buffer.from(b64, "base64");
    expect(buf.length).toBeGreaterThan(50);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      .toBe(true);
  });
});

describe("getSpecialFormat", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(getSpecialFormat(null)).toBeNull();
    expect(getSpecialFormat(undefined)).toBeNull();
    expect(getSpecialFormat("")).toBeNull();
  });

  it("returns null for non-special formats", () => {
    expect(getSpecialFormat("digital")).toBeNull();
    expect(getSpecialFormat("Standard")).toBeNull();
    expect(getSpecialFormat("DCP")).toBeNull();
  });

  it("normalises 35mm variants", () => {
    expect(getSpecialFormat("35mm")).toBe("35mm");
    expect(getSpecialFormat("35MM")).toBe("35mm");
    expect(getSpecialFormat("35mm Print")).toBe("35mm");
  });

  it("normalises 70mm variants", () => {
    expect(getSpecialFormat("70mm")).toBe("70mm");
    expect(getSpecialFormat("70MM IMAX")).toBe("70mm"); // 70mm wins via the explicit if-order
  });

  it("normalises IMAX variants (case-insensitive)", () => {
    expect(getSpecialFormat("IMAX")).toBe("IMAX");
    expect(getSpecialFormat("imax")).toBe("IMAX");
    expect(getSpecialFormat("IMAX Laser")).toBe("IMAX");
  });

  it("normalises 4K variants", () => {
    expect(getSpecialFormat("4K")).toBe("4K");
    expect(getSpecialFormat("4k restoration")).toBe("4K");
  });

  it("priority is 70mm > 35mm > IMAX > 4K within the if/else cascade for a multi-tag string", () => {
    // The cascading if-blocks pick the FIRST match in the order: 70mm, 35mm,
    // IMAX, 4K. Pinning this priority so a refactor doesn't accidentally
    // reorder the checks and break frontend format-badge displays.
    expect(getSpecialFormat("70mm IMAX")).toBe("70mm");
    expect(getSpecialFormat("35mm 4K Restoration")).toBe("35mm");
    expect(getSpecialFormat("IMAX 4K")).toBe("IMAX");
  });

  it("returns null for whitespace-only strings (no special tokens)", () => {
    expect(getSpecialFormat("   ")).toBeNull();
  });
});
