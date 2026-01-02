/**
 * Scraper Snapshot Testing Utilities
 *
 * Captures and compares scraper output to detect regressions.
 * These are integration tests that actually run scrapers.
 *
 * Usage:
 *   npm run scrape:snapshot -- capture bfi-southbank  # Capture baseline
 *   npm run scrape:snapshot -- compare bfi-southbank  # Compare against baseline
 *   npm run scrape:snapshot -- capture-all            # Capture all cinemas
 *   npm run scrape:snapshot -- compare-all            # Compare all cinemas
 */

import * as fs from "fs";
import * as path from "path";
import type { RawScreening } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface ScreeningSnapshot {
  filmTitle: string;
  datetime: string; // ISO string
  screen?: string;
  format?: string;
  hasBookingUrl: boolean;
  eventType?: string;
}

export interface ScraperSnapshot {
  cinemaId: string;
  capturedAt: string;
  screeningCount: number;
  uniqueFilms: number;
  dateRange: {
    earliest: string;
    latest: string;
  };
  screenings: ScreeningSnapshot[];
  formats: string[];
  screens: string[];
}

export interface SnapshotComparison {
  cinemaId: string;
  match: boolean;
  differences: SnapshotDifference[];
  baselineCount: number;
  currentCount: number;
  countDelta: number;
  newFilms: string[];
  missingFilms: string[];
}

export interface SnapshotDifference {
  type: "added" | "removed" | "changed";
  description: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Snapshot Directory
// ============================================================================

const SNAPSHOT_DIR = path.join(process.cwd(), "src/scrapers/__tests__/snapshots");

function ensureSnapshotDir(): void {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function getSnapshotPath(cinemaId: string): string {
  return path.join(SNAPSHOT_DIR, `${cinemaId}.snapshot.json`);
}

// ============================================================================
// Snapshot Creation
// ============================================================================

/**
 * Convert raw screenings to a normalized snapshot format
 */
export function createSnapshot(
  cinemaId: string,
  screenings: RawScreening[]
): ScraperSnapshot {
  // Sort screenings by datetime for consistent comparison
  const sorted = [...screenings].sort(
    (a, b) => a.datetime.getTime() - b.datetime.getTime()
  );

  // Extract unique values
  const uniqueFilms = new Set(screenings.map((s) => s.filmTitle));
  const formats = [...new Set(screenings.map((s) => s.format).filter(Boolean))] as string[];
  const screens = [...new Set(screenings.map((s) => s.screen).filter(Boolean))] as string[];

  // Calculate date range
  const dates = screenings.map((s) => s.datetime.getTime());
  const earliest = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : "";
  const latest = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : "";

  // Create normalized screening list
  const snapshotScreenings: ScreeningSnapshot[] = sorted.map((s) => ({
    filmTitle: s.filmTitle,
    datetime: s.datetime.toISOString(),
    screen: s.screen,
    format: s.format,
    hasBookingUrl: !!s.bookingUrl,
    eventType: s.eventType,
  }));

  return {
    cinemaId,
    capturedAt: new Date().toISOString(),
    screeningCount: screenings.length,
    uniqueFilms: uniqueFilms.size,
    dateRange: { earliest, latest },
    screenings: snapshotScreenings,
    formats: formats.sort(),
    screens: screens.sort(),
  };
}

/**
 * Save a snapshot to disk
 */
export function saveSnapshot(snapshot: ScraperSnapshot): string {
  ensureSnapshotDir();
  const filePath = getSnapshotPath(snapshot.cinemaId);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  return filePath;
}

/**
 * Load a snapshot from disk
 */
export function loadSnapshot(cinemaId: string): ScraperSnapshot | null {
  const filePath = getSnapshotPath(cinemaId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * List all available snapshots
 */
export function listSnapshots(): string[] {
  ensureSnapshotDir();
  const files = fs.readdirSync(SNAPSHOT_DIR);
  return files
    .filter((f) => f.endsWith(".snapshot.json"))
    .map((f) => f.replace(".snapshot.json", ""));
}

// ============================================================================
// Snapshot Comparison
// ============================================================================

/**
 * Compare current screenings against a baseline snapshot
 */
export function compareSnapshots(
  cinemaId: string,
  currentScreenings: RawScreening[]
): SnapshotComparison {
  const baseline = loadSnapshot(cinemaId);
  const current = createSnapshot(cinemaId, currentScreenings);

  if (!baseline) {
    return {
      cinemaId,
      match: false,
      differences: [
        {
          type: "added",
          description: "No baseline snapshot exists - run capture first",
        },
      ],
      baselineCount: 0,
      currentCount: current.screeningCount,
      countDelta: current.screeningCount,
      newFilms: [...new Set(currentScreenings.map((s) => s.filmTitle))],
      missingFilms: [],
    };
  }

  const differences: SnapshotDifference[] = [];

  // Compare counts
  const countDelta = current.screeningCount - baseline.screeningCount;
  if (Math.abs(countDelta) > baseline.screeningCount * 0.2) {
    // >20% change
    differences.push({
      type: "changed",
      description: `Screening count changed significantly: ${baseline.screeningCount} → ${current.screeningCount} (${countDelta > 0 ? "+" : ""}${countDelta})`,
      details: { baseline: baseline.screeningCount, current: current.screeningCount },
    });
  }

  // Compare film sets
  const baselineFilms = new Set(baseline.screenings.map((s) => s.filmTitle));
  const currentFilms = new Set(current.screenings.map((s) => s.filmTitle));

  const newFilms = [...currentFilms].filter((f) => !baselineFilms.has(f));
  const missingFilms = [...baselineFilms].filter((f) => !currentFilms.has(f));

  if (newFilms.length > 0) {
    differences.push({
      type: "added",
      description: `${newFilms.length} new films found`,
      details: { films: newFilms.slice(0, 10) },
    });
  }

  if (missingFilms.length > 0) {
    differences.push({
      type: "removed",
      description: `${missingFilms.length} films no longer found`,
      details: { films: missingFilms.slice(0, 10) },
    });
  }

  // Compare formats
  const baselineFormats = new Set(baseline.formats);
  const currentFormats = new Set(current.formats);
  const newFormats = [...currentFormats].filter((f) => !baselineFormats.has(f));
  const missingFormats = [...baselineFormats].filter((f) => !currentFormats.has(f));

  if (newFormats.length > 0 || missingFormats.length > 0) {
    differences.push({
      type: "changed",
      description: "Formats changed",
      details: { new: newFormats, missing: missingFormats },
    });
  }

  // Compare screens
  const baselineScreens = new Set(baseline.screens);
  const currentScreens = new Set(current.screens);
  const newScreens = [...currentScreens].filter((s) => !baselineScreens.has(s));
  const missingScreens = [...baselineScreens].filter((s) => !currentScreens.has(s));

  if (newScreens.length > 0 || missingScreens.length > 0) {
    differences.push({
      type: "changed",
      description: "Screens changed",
      details: { new: newScreens, missing: missingScreens },
    });
  }

  // Check for suspicious time patterns (all at same time, all early morning)
  const hours = current.screenings.map((s) => new Date(s.datetime).getHours());
  const earlyMorningCount = hours.filter((h) => h >= 0 && h < 10).length;

  if (earlyMorningCount > current.screeningCount * 0.3) {
    differences.push({
      type: "changed",
      description: `${earlyMorningCount} screenings have suspicious early morning times (before 10am)`,
      details: { earlyMorningCount, total: current.screeningCount },
    });
  }

  return {
    cinemaId,
    match: differences.length === 0,
    differences,
    baselineCount: baseline.screeningCount,
    currentCount: current.screeningCount,
    countDelta,
    newFilms,
    missingFilms,
  };
}

// ============================================================================
// CLI Output
// ============================================================================

/**
 * Print a comparison result to console
 */
export function printComparison(comparison: SnapshotComparison): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Snapshot Comparison: ${comparison.cinemaId}`);
  console.log("=".repeat(60));

  if (comparison.match) {
    console.log("✅ MATCH - No significant differences detected");
  } else {
    console.log("⚠️  DIFFERENCES DETECTED");
  }

  console.log(`\nBaseline: ${comparison.baselineCount} screenings`);
  console.log(`Current:  ${comparison.currentCount} screenings`);
  console.log(`Delta:    ${comparison.countDelta > 0 ? "+" : ""}${comparison.countDelta}`);

  if (comparison.differences.length > 0) {
    console.log("\nDifferences:");
    for (const diff of comparison.differences) {
      const icon = diff.type === "added" ? "➕" : diff.type === "removed" ? "➖" : "🔄";
      console.log(`  ${icon} ${diff.description}`);
      if (diff.details) {
        console.log(`     ${JSON.stringify(diff.details)}`);
      }
    }
  }

  if (comparison.newFilms.length > 0) {
    console.log(`\nNew films (${comparison.newFilms.length}):`);
    comparison.newFilms.slice(0, 5).forEach((f) => console.log(`  + ${f}`));
    if (comparison.newFilms.length > 5) {
      console.log(`  ... and ${comparison.newFilms.length - 5} more`);
    }
  }

  if (comparison.missingFilms.length > 0) {
    console.log(`\nMissing films (${comparison.missingFilms.length}):`);
    comparison.missingFilms.slice(0, 5).forEach((f) => console.log(`  - ${f}`));
    if (comparison.missingFilms.length > 5) {
      console.log(`  ... and ${comparison.missingFilms.length - 5} more`);
    }
  }

  console.log("");
}

/**
 * Print a snapshot summary
 */
export function printSnapshot(snapshot: ScraperSnapshot): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📸 Snapshot: ${snapshot.cinemaId}`);
  console.log("=".repeat(60));
  console.log(`Captured:     ${snapshot.capturedAt}`);
  console.log(`Screenings:   ${snapshot.screeningCount}`);
  console.log(`Unique films: ${snapshot.uniqueFilms}`);
  console.log(`Date range:   ${snapshot.dateRange.earliest.split("T")[0]} to ${snapshot.dateRange.latest.split("T")[0]}`);
  console.log(`Formats:      ${snapshot.formats.join(", ") || "none"}`);
  console.log(`Screens:      ${snapshot.screens.join(", ") || "none"}`);
  console.log("");
}
