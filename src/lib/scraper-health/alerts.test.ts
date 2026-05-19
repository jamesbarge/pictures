import { describe, expect, it } from "vitest";
import { generateHealthSummary } from "./alerts";
import type { HealthCheckResult } from "./index";

function makeResult(overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
  return {
    timestamp: new Date("2026-05-18T12:00:00.000Z"),
    totalCinemas: 10,
    healthyCinemas: 8,
    warnCinemas: 1,
    criticalCinemas: 1,
    metrics: [],
    alerts: [],
    ...overrides,
  };
}

describe("generateHealthSummary", () => {
  it("includes the header line", () => {
    const out = generateHealthSummary(makeResult());
    expect(out).toContain("=== Scraper Health Check ===");
  });

  it("includes the ISO timestamp", () => {
    const out = generateHealthSummary(makeResult());
    expect(out).toContain("2026-05-18T12:00:00.000Z");
  });

  it("includes Total/Healthy/Warning/Critical counts on a single line", () => {
    const out = generateHealthSummary(
      makeResult({
        totalCinemas: 60,
        healthyCinemas: 50,
        warnCinemas: 7,
        criticalCinemas: 3,
      }),
    );
    expect(out).toContain("Total: 60 | Healthy: 50 | Warning: 7 | Critical: 3");
  });

  it("omits the Alerts section when alerts array is empty", () => {
    const out = generateHealthSummary(makeResult({ alerts: [] }));
    expect(out).not.toContain("Alerts");
  });

  it("renders [WARNING] prefix for warn-type alerts", () => {
    const out = generateHealthSummary(
      makeResult({
        alerts: [
          {
            cinemaId: "bfi-southbank",
            cinemaName: "BFI Southbank",
            alertType: "warn_stale",
            message: "BFI Southbank: last scrape 13h ago",
            hoursSinceLastScrape: 13,
            screeningsCount: 100,
          },
        ],
      }),
    );
    expect(out).toContain("[WARNING] BFI Southbank: last scrape 13h ago");
  });

  it("renders [CRITICAL] prefix for critical-type alerts (alertType.startsWith('critical'))", () => {
    const out = generateHealthSummary(
      makeResult({
        alerts: [
          {
            cinemaId: "rio-dalston",
            cinemaName: "Rio Dalston",
            alertType: "critical_no_screenings",
            message: "Rio Dalston has no screenings",
            hoursSinceLastScrape: null,
            screeningsCount: 0,
          },
        ],
      }),
    );
    expect(out).toContain("[CRITICAL] Rio Dalston has no screenings");
  });

  it("renders the alerts count header", () => {
    const out = generateHealthSummary(
      makeResult({
        alerts: [
          {
            cinemaId: "a",
            cinemaName: "A",
            alertType: "warn_stale",
            message: "msg1",
            hoursSinceLastScrape: 13,
            screeningsCount: 5,
          },
          {
            cinemaId: "b",
            cinemaName: "B",
            alertType: "warn_stale",
            message: "msg2",
            hoursSinceLastScrape: 14,
            screeningsCount: 5,
          },
        ],
      }),
    );
    expect(out).toContain("Alerts (2):");
  });
});
