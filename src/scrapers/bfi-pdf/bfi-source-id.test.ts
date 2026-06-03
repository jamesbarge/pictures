import { describe, it, expect } from "vitest";
import { buildBfiSourceId, normalizeBfiScreen, bfiTitleSlug } from "./bfi-source-id";

describe("normalizeBfiScreen", () => {
  it("extracts the same canonical token regardless of source path format", () => {
    // Playwright row[63] form vs PDF/changes venue form → identical token.
    expect(normalizeBfiScreen("Southbank - NFT3")).toBe("NFT3");
    expect(normalizeBfiScreen("NFT3")).toBe("NFT3");
    expect(normalizeBfiScreen("nft3")).toBe("NFT3");
  });
  it("normalises IMAX, STUDIO and Reuben variants", () => {
    expect(normalizeBfiScreen("BFI IMAX")).toBe("IMAX");
    expect(normalizeBfiScreen("IMAX")).toBe("IMAX");
    expect(normalizeBfiScreen("STUDIO")).toBe("STUDIO");
    expect(normalizeBfiScreen("BFI Reuben Library")).toBe("REUBEN");
  });
  it("falls back to 'na' for empty/unknown", () => {
    expect(normalizeBfiScreen(undefined)).toBe("na");
    expect(normalizeBfiScreen("")).toBe("na");
    expect(normalizeBfiScreen("   ")).toBe("na");
  });
});

describe("bfiTitleSlug", () => {
  it("matches the pre-existing lowercase-hyphen slug (minimises churn)", () => {
    expect(bfiTitleSlug("Raging Bull")).toBe("raging-bull");
    expect(bfiTitleSlug("  The   King of Comedy ")).toBe("the-king-of-comedy");
  });
});

describe("buildBfiSourceId — path-agnostic keying", () => {
  const dt = new Date("2026-07-04T18:00:00.000Z");

  it("produces an IDENTICAL id for the same screening across all three paths", () => {
    // Playwright supplies "Southbank - NFT3"; PDF/changes supply "NFT3".
    const playwright = buildBfiSourceId("bfi-southbank", "Raging Bull", "Southbank - NFT3", dt);
    const pdf = buildBfiSourceId("bfi-southbank", "Raging Bull", "NFT3", dt);
    const changes = buildBfiSourceId("bfi-southbank", "Raging Bull", "nft3", dt);
    expect(playwright).toBe(pdf);
    expect(pdf).toBe(changes);
    expect(playwright).toBe("bfi-bfi-southbank-raging-bull-NFT3-2026-07-04T18:00:00.000Z");
  });

  it("disambiguates the same film showing simultaneously in two screens", () => {
    const nft1 = buildBfiSourceId("bfi-southbank", "Raging Bull", "NFT1", dt);
    const nft2 = buildBfiSourceId("bfi-southbank", "Raging Bull", "NFT2", dt);
    expect(nft1).not.toBe(nft2);
  });

  it("keys IMAX screenings to the imax cinemaId distinctly", () => {
    const imax = buildBfiSourceId("bfi-imax", "Dunkirk", "BFI IMAX", dt);
    const southbank = buildBfiSourceId("bfi-southbank", "Dunkirk", "NFT1", dt);
    expect(imax).not.toBe(southbank);
    expect(imax).toContain("bfi-bfi-imax-dunkirk-IMAX-");
  });
});
