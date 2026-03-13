/**
 * HTML Snapshotter
 *
 * Captures cinema listing page HTML for diffing between experiments.
 * Uses fetch for static sites and stores snapshots to disk for analysis.
 */

import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { join } from "path";
import * as cheerio from "cheerio";
import { CHROME_USER_AGENT_FULL } from "@/scrapers/constants";
import type { HtmlSnapshot, HtmlDiff } from "../types";

const SNAPSHOT_DIR = join(process.cwd(), ".autoresearch", "snapshots");

/**
 * Capture HTML from a cinema listing URL.
 */
export async function captureSnapshot(
  cinemaId: string,
  url: string,
  activeSelectors?: Record<string, string>
): Promise<HtmlSnapshot> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": CHROME_USER_AGENT_FULL,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to capture ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();

  return {
    cinemaId,
    url,
    html,
    capturedAt: new Date(),
    activeSelectors,
  };
}

/**
 * Save a snapshot to disk for later diffing.
 */
export async function saveSnapshot(snapshot: HtmlSnapshot): Promise<string> {
  const cinemaDir = join(SNAPSHOT_DIR, snapshot.cinemaId);
  await mkdir(cinemaDir, { recursive: true });

  const timestamp = snapshot.capturedAt.toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}.html`;
  const filepath = join(cinemaDir, filename);

  await writeFile(filepath, snapshot.html, "utf-8");

  // Also save metadata alongside the HTML
  const metaPath = join(cinemaDir, `${timestamp}.meta.json`);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        url: snapshot.url,
        capturedAt: snapshot.capturedAt.toISOString(),
        activeSelectors: snapshot.activeSelectors,
        htmlLength: snapshot.html.length,
      },
      null,
      2
    ),
    "utf-8"
  );

  return filepath;
}

/**
 * Load the most recent snapshot for a cinema, or null if none exists.
 */
export async function loadLatestSnapshot(
  cinemaId: string
): Promise<HtmlSnapshot | null> {
  const cinemaDir = join(SNAPSHOT_DIR, cinemaId);

  try {
    const files = await readdir(cinemaDir);
    const htmlFiles = files.filter((f) => f.endsWith(".html")).sort().reverse();

    if (htmlFiles.length === 0) return null;

    const latestFile = htmlFiles[0];
    const html = await readFile(join(cinemaDir, latestFile), "utf-8");

    // Load metadata
    const metaFile = latestFile.replace(".html", ".meta.json");
    let meta: { url?: string; capturedAt?: string; activeSelectors?: Record<string, string> } = {};
    try {
      const metaRaw = await readFile(join(cinemaDir, metaFile), "utf-8");
      meta = JSON.parse(metaRaw);
    } catch {
      // Metadata file may not exist for older snapshots
    }

    return {
      cinemaId,
      url: meta.url ?? "",
      html,
      capturedAt: meta.capturedAt ? new Date(meta.capturedAt) : new Date(),
      activeSelectors: meta.activeSelectors,
    };
  } catch (err) {
    // ENOENT = snapshot directory doesn't exist yet (expected on first run)
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err; // Real filesystem error — surface it
  }
}

/**
 * Diff two HTML snapshots to identify what changed.
 * Focuses on structural changes relevant to scraping (selectors, containers).
 */
export function diffSnapshots(
  previous: HtmlSnapshot,
  current: HtmlSnapshot
): HtmlDiff {
  const prevDoc = cheerio.load(previous.html);
  const currDoc = cheerio.load(current.html);

  const brokenSelectors: string[] = [];
  const candidateSelectors: string[] = [];
  const changes: string[] = [];

  // Check which active selectors still work
  if (previous.activeSelectors) {
    for (const [purpose, selector] of Object.entries(previous.activeSelectors)) {
      const prevCount = prevDoc(selector).length;
      const currCount = currDoc(selector).length;

      if (prevCount > 0 && currCount === 0) {
        brokenSelectors.push(selector);
        changes.push(`Selector for "${purpose}" (${selector}) no longer matches (was ${prevCount} elements)`);
      } else if (currCount !== prevCount) {
        changes.push(`Selector for "${purpose}" (${selector}): ${prevCount} -> ${currCount} elements`);
      }
    }
  }

  // Look for common screening container patterns in the new HTML
  const screeningPatterns = [
    '[class*="screening"]',
    '[class*="showtime"]',
    '[class*="performance"]',
    '[class*="film-card"]',
    '[class*="movie"]',
    '[class*="event-item"]',
    '[class*="listing"]',
    '[data-film]',
    '[data-screening]',
    '[data-showtime]',
    "article",
    ".card",
  ];

  for (const pattern of screeningPatterns) {
    const count = currDoc(pattern).length;
    if (count > 3) {
      candidateSelectors.push(`${pattern} (${count} matches)`);
    }
  }

  // Broken selectors are the authoritative structural-change signal.
  // Byte-length heuristic is only a fallback when no selectors are tracked,
  // and uses a high threshold to avoid false positives from inline JSON/nonces.
  const sizeChangeRatio = previous.html.length > 0
    ? Math.abs(current.html.length - previous.html.length) / previous.html.length
    : 0;
  const structureChanged = brokenSelectors.length > 0 ||
    (!previous.activeSelectors && sizeChangeRatio > 0.6);

  return {
    cinemaId: current.cinemaId,
    structureChanged,
    changeSummary: changes.length > 0
      ? changes.join("\n")
      : "No significant structural changes detected",
    brokenSelectors,
    candidateSelectors,
  };
}

/**
 * Extract a focused HTML excerpt around screening elements for the agent prompt.
 * Returns a trimmed version of the HTML (max ~10KB) that the agent can analyze.
 */
export function extractRelevantHtml(
  html: string,
  selectors: string[],
  maxLength = 10_000
): string {
  const $ = cheerio.load(html);

  // Try each selector, take the first that produces results
  for (const selector of selectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      // Get parent container for context
      const parent = elements.first().parent();
      const excerpt = parent.html() ?? "";
      if (excerpt.length > 0) {
        return excerpt.length > maxLength
          ? excerpt.slice(0, maxLength) + "\n<!-- truncated -->"
          : excerpt;
      }
    }
  }

  // Fallback: return the body, truncated
  const body = $("body").html() ?? html;
  return body.length > maxLength
    ? body.slice(0, maxLength) + "\n<!-- truncated -->"
    : body;
}
