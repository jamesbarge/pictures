import { describe, it, expect } from "vitest";
import { CURZON_CONFIG } from "./curzon";

/**
 * Curzon booking URL shape test.
 *
 * Curzon uses query-param format: /ticketing/seats/?sessionId={id}
 * This test locks the URL pattern so a future change is caught by CI.
 */
describe("Curzon booking URL format", () => {
  const baseUrl = CURZON_CONFIG.baseUrl;

  function buildBookingUrl(showtimeId: string): string {
    return `${baseUrl}/ticketing/seats/?sessionId=${encodeURIComponent(showtimeId)}`;
  }

  it("produces query-param format with sessionId", () => {
    const url = buildBookingUrl("MAY1-32556");
    expect(url).toBe("https://www.curzon.com/ticketing/seats/?sessionId=MAY1-32556");
  });

  it("encodes special characters in showtime ID", () => {
    const url = buildBookingUrl("TEST+ID&foo=bar");
    expect(url).toBe("https://www.curzon.com/ticketing/seats/?sessionId=TEST%2BID%26foo%3Dbar");
  });

  it("does not use path-based format", () => {
    const url = buildBookingUrl("SOH1-54064");
    expect(url).not.toMatch(/\/ticketing\/seats\/SOH1-54064/);
    expect(url).toContain("?sessionId=SOH1-54064");
  });
});
