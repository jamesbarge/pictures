import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDiscovery } from "./discovery";

describe("discovery store", () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscovery.getState().resetDiscovery();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts with both features unvisited and banner not dismissed", () => {
    const s = useDiscovery.getState();
    expect(s.hasVisitedReachable).toBe(false);
    expect(s.hasVisitedMap).toBe(false);
    expect(s.bannerDismissedAt).toBeNull();
  });

  it("markFeatureVisited('reachable') sets only that flag", () => {
    useDiscovery.getState().markFeatureVisited("reachable");
    const s = useDiscovery.getState();
    expect(s.hasVisitedReachable).toBe(true);
    expect(s.hasVisitedMap).toBe(false);
  });

  it("markFeatureVisited('map') sets only that flag", () => {
    useDiscovery.getState().markFeatureVisited("map");
    const s = useDiscovery.getState();
    expect(s.hasVisitedMap).toBe(true);
    expect(s.hasVisitedReachable).toBe(false);
  });

  it("dismissBanner stamps an ISO timestamp", () => {
    const before = Date.now();
    useDiscovery.getState().dismissBanner();
    const after = Date.now();
    const stamped = useDiscovery.getState().bannerDismissedAt;
    expect(stamped).toBeTruthy();
    const ms = new Date(stamped!).getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it("shouldShowBanner returns true initially", () => {
    expect(useDiscovery.getState().shouldShowBanner()).toBe(true);
  });

  it("shouldShowBanner returns false after BOTH features visited (auto-hide)", () => {
    useDiscovery.getState().markFeatureVisited("reachable");
    useDiscovery.getState().markFeatureVisited("map");
    expect(useDiscovery.getState().shouldShowBanner()).toBe(false);
  });

  it("shouldShowBanner still TRUE when only one feature visited", () => {
    useDiscovery.getState().markFeatureVisited("reachable");
    expect(useDiscovery.getState().shouldShowBanner()).toBe(true);
  });

  it("shouldShowBanner returns false after manual dismissal (even without visiting features)", () => {
    useDiscovery.getState().dismissBanner();
    expect(useDiscovery.getState().shouldShowBanner()).toBe(false);
  });

  it("resetDiscovery reverts to default state", () => {
    useDiscovery.getState().markFeatureVisited("reachable");
    useDiscovery.getState().dismissBanner();
    useDiscovery.getState().resetDiscovery();
    const s = useDiscovery.getState();
    expect(s.hasVisitedReachable).toBe(false);
    expect(s.bannerDismissedAt).toBeNull();
  });
});
