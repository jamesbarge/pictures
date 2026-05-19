import { describe, expect, it } from "vitest";
import {
  getAllTriggerTaskIds,
  getTriggerTaskId,
} from "./task-registry";

describe("getTriggerTaskId", () => {
  it("returns the independent task ID for a known independent cinema", () => {
    expect(getTriggerTaskId("rio-dalston")).toBe("scraper-rio");
    expect(getTriggerTaskId("ica")).toBe("scraper-ica");
    expect(getTriggerTaskId("barbican")).toBe("scraper-barbican");
  });

  it("returns the chain task ID when the cinema is in a chain", () => {
    // bfi-southbank is registered explicitly in INDEPENDENT_TASK_MAP. To test
    // the chain branch we need a cinema whose chain is in CHAIN_TASK_MAP
    // (curzon/picturehouse/everyman) AND whose ID is NOT in
    // INDEPENDENT_TASK_MAP. Real example: any Curzon venue from the registry.
    const cinemaId = "curzon-soho"; // canonical Curzon Soho id
    const result = getTriggerTaskId(cinemaId);
    expect(result).toBe("scraper-chain-curzon");
  });

  it("returns null for an unknown cinema ID", () => {
    expect(getTriggerTaskId("xyzzy-plugh")).toBeNull();
  });

  it("checks independent-map FIRST (precedence over chain when both could match)", () => {
    // bfi-southbank is in INDEPENDENT_TASK_MAP and ALSO has chain=null in the
    // registry. The independent-map check fires first, returning "scraper-bfi"
    // not falling through to the chain lookup.
    expect(getTriggerTaskId("bfi-southbank")).toBe("scraper-bfi");
  });

  it("returns the same task ID for both BFI Southbank and BFI IMAX (shared scraper)", () => {
    // Both share the "scraper-bfi" task — the BFI scraper handles both venues.
    expect(getTriggerTaskId("bfi-southbank")).toBe("scraper-bfi");
    expect(getTriggerTaskId("bfi-imax")).toBe("scraper-bfi");
  });

  it("returns the same task ID for both Electric venues (shared chain scraper)", () => {
    expect(getTriggerTaskId("electric-portobello")).toBe("scraper-electric");
    expect(getTriggerTaskId("electric-white-city")).toBe("scraper-electric");
  });
});

describe("getAllTriggerTaskIds", () => {
  it("returns a deduplicated list of task IDs", () => {
    const all = getAllTriggerTaskIds();
    expect(new Set(all).size).toBe(all.length);
  });

  it("includes all chain task IDs", () => {
    const all = getAllTriggerTaskIds();
    expect(all).toContain("scraper-chain-curzon");
    expect(all).toContain("scraper-chain-picturehouse");
    expect(all).toContain("scraper-chain-everyman");
  });

  it("includes representative independent task IDs", () => {
    const all = getAllTriggerTaskIds();
    expect(all).toContain("scraper-bfi");
    expect(all).toContain("scraper-rio");
    expect(all).toContain("scraper-barbican");
  });

  it("does NOT include the cinema-ID side of the mapping (task IDs only)", () => {
    const all = getAllTriggerTaskIds();
    expect(all).not.toContain("bfi-southbank");
    expect(all).not.toContain("rio-dalston");
    // Every task ID should start with `scraper-` per the naming convention.
    for (const taskId of all) {
      expect(taskId.startsWith("scraper-")).toBe(true);
    }
  });
});
