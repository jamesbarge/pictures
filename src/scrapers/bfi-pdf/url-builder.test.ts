import { describe, it, expect } from "vitest";
import { buildBFISearchUrl } from "./url-builder";

describe("buildBFISearchUrl", () => {
  const SOUTHBANK_ID = "25E7EA2E-291F-44F9-8EBC-E560154FDAEB";
  const IMAX_ID = "49C49C83-6BA0-420C-A784-9B485E36E2E0";

  describe("venue routing", () => {
    it("routes NFT screens to Southbank", () => {
      const url = buildBFISearchUrl("Vertigo", "NFT1");
      expect(url).toContain("whatson.bfi.org.uk/Online/");
      expect(url).toContain(SOUTHBANK_ID);
    });

    it("routes STUDIO to Southbank", () => {
      const url = buildBFISearchUrl("Vertigo", "STUDIO");
      expect(url).toContain("whatson.bfi.org.uk/Online/");
      expect(url).toContain(SOUTHBANK_ID);
    });

    it("routes IMAX screen to IMAX site", () => {
      const url = buildBFISearchUrl("Dune: Part Two", "IMAX");
      expect(url).toContain("whatson.bfi.org.uk/imax/Online/");
      expect(url).toContain(IMAX_ID);
    });

    it("routes BFI IMAX to IMAX site", () => {
      const url = buildBFISearchUrl("Dune: Part Two", "BFI IMAX");
      expect(url).toContain("whatson.bfi.org.uk/imax/Online/");
      expect(url).toContain(IMAX_ID);
    });

    it("routes bfi-imax cinema ID to IMAX site", () => {
      const url = buildBFISearchUrl("Dune: Part Two", "bfi-imax");
      expect(url).toContain("whatson.bfi.org.uk/imax/Online/");
      expect(url).toContain(IMAX_ID);
    });

    it("routes bfi-southbank cinema ID to Southbank", () => {
      const url = buildBFISearchUrl("Vertigo", "bfi-southbank");
      expect(url).toContain("whatson.bfi.org.uk/Online/");
      expect(url).toContain(SOUTHBANK_ID);
    });

    it("defaults to Southbank when no venue given", () => {
      const url = buildBFISearchUrl("Vertigo");
      expect(url).toContain("whatson.bfi.org.uk/Online/");
      expect(url).toContain(SOUTHBANK_ID);
    });

    it("defaults to Southbank for unknown venue", () => {
      const url = buildBFISearchUrl("Vertigo", "SOME_OTHER_ROOM");
      expect(url).toContain("whatson.bfi.org.uk/Online/");
      expect(url).toContain(SOUTHBANK_ID);
    });

    it("is case-insensitive for IMAX detection", () => {
      const url = buildBFISearchUrl("Film", "imax");
      expect(url).toContain(IMAX_ID);
    });
  });

  describe("title encoding", () => {
    it("encodes spaces", () => {
      const url = buildBFISearchUrl("The Grand Budapest Hotel");
      expect(url).toContain("search_criteria=The%20Grand%20Budapest%20Hotel");
    });

    it("encodes special characters", () => {
      const url = buildBFISearchUrl("Amélie");
      expect(url).toContain("search_criteria=Am%C3%A9lie");
    });

    it("encodes colons and ampersands", () => {
      const url = buildBFISearchUrl("Lock, Stock & Two Smoking Barrels");
      expect(url).toContain("search_criteria=Lock%2C%20Stock%20%26%20Two%20Smoking%20Barrels");
    });
  });

  describe("URL structure", () => {
    it("produces a valid BFI search URL", () => {
      const url = buildBFISearchUrl("Vertigo", "NFT1");
      expect(url).toBe(
        `https://whatson.bfi.org.uk/Online/default.asp?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_id=${SOUTHBANK_ID}&BOset::WScontent::SearchCriteria::search_criteria=Vertigo`
      );
    });

    it("produces a valid IMAX search URL", () => {
      const url = buildBFISearchUrl("Dune", "IMAX");
      expect(url).toBe(
        `https://whatson.bfi.org.uk/imax/Online/default.asp?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_id=${IMAX_ID}&BOset::WScontent::SearchCriteria::search_criteria=Dune`
      );
    });

    it("does NOT contain the old article_search_text param", () => {
      const url = buildBFISearchUrl("Test Film");
      expect(url).not.toContain("article_search_text");
    });
  });
});
