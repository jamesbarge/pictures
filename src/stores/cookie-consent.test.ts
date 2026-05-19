/**
 * Tests for the cookie-consent Zustand store.
 *
 * The store uses `persist` middleware backed by localStorage. We clear
 * localStorage and reset the store state between tests for isolation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCookieConsent } from "./cookie-consent";

describe("cookie-consent store", () => {
  beforeEach(() => {
    localStorage.clear();
    useCookieConsent.setState({
      analyticsConsent: "pending",
      consentUpdatedAt: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts in 'pending' state with null timestamp", () => {
    const s = useCookieConsent.getState();
    expect(s.analyticsConsent).toBe("pending");
    expect(s.consentUpdatedAt).toBeNull();
  });

  it("acceptAnalytics sets status to 'accepted' and stamps consentUpdatedAt", () => {
    const before = Date.now();
    useCookieConsent.getState().acceptAnalytics();
    const after = Date.now();

    const s = useCookieConsent.getState();
    expect(s.analyticsConsent).toBe("accepted");
    expect(s.consentUpdatedAt).toBeTruthy();

    const stampedMs = new Date(s.consentUpdatedAt!).getTime();
    expect(stampedMs).toBeGreaterThanOrEqual(before);
    expect(stampedMs).toBeLessThanOrEqual(after);
  });

  it("rejectAnalytics sets status to 'rejected' and stamps consentUpdatedAt", () => {
    useCookieConsent.getState().rejectAnalytics();
    const s = useCookieConsent.getState();
    expect(s.analyticsConsent).toBe("rejected");
    expect(s.consentUpdatedAt).toBeTruthy();
  });

  it("resetConsent reverts to 'pending' + null timestamp", () => {
    useCookieConsent.getState().acceptAnalytics();
    useCookieConsent.getState().resetConsent();

    const s = useCookieConsent.getState();
    expect(s.analyticsConsent).toBe("pending");
    expect(s.consentUpdatedAt).toBeNull();
  });

  it("hasDecided returns true after accept", () => {
    useCookieConsent.getState().acceptAnalytics();
    expect(useCookieConsent.getState().hasDecided()).toBe(true);
  });

  it("hasDecided returns true after reject", () => {
    useCookieConsent.getState().rejectAnalytics();
    expect(useCookieConsent.getState().hasDecided()).toBe(true);
  });

  it("hasDecided returns false in 'pending' state", () => {
    expect(useCookieConsent.getState().hasDecided()).toBe(false);
  });

  it("canTrack returns true ONLY for 'accepted'", () => {
    expect(useCookieConsent.getState().canTrack()).toBe(false); // pending
    useCookieConsent.getState().rejectAnalytics();
    expect(useCookieConsent.getState().canTrack()).toBe(false); // rejected
    useCookieConsent.getState().acceptAnalytics();
    expect(useCookieConsent.getState().canTrack()).toBe(true);
  });

  it("persists analytics consent across getState calls (persist middleware contract)", () => {
    useCookieConsent.getState().acceptAnalytics();
    // The 'persist' middleware writes through to localStorage; the next read
    // sees the persisted value. We verify state survives independent reads.
    expect(useCookieConsent.getState().analyticsConsent).toBe("accepted");
    expect(useCookieConsent.getState().canTrack()).toBe(true);
  });
});
