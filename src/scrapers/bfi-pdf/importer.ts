/**
 * BFI PDF Importer
 *
 * Orchestrates the BFI PDF scraping pipeline:
 * 1. Fetches monthly guide PDFs (accessible versions)
 * 2. Parses PDF content for screenings
 * 3. Fetches programme changes for updates
 * 4. Merges and deduplicates screenings
 * 5. Saves to database via the standard pipeline
 *
 * Key features:
 * - Cloud-runnable (no Playwright dependency)
 * - Content hashing for efficient change detection
 * - Combines PDF source with programme changes
 */

import { fetchLatestPDF, fetchAllRelevantPDFs, type FetchedPDF } from "./fetcher";
import { parsePDF, type ParseResult } from "./pdf-parser";
import { fetchProgrammeChanges, type ProgrammeChangesResult } from "./programme-changes-parser";
import { saveScreenings, ensureCinemaExists } from "../pipeline";
import type { RawScreening } from "../types";

// BFI venue definitions for ensuring cinemas exist
const BFI_VENUES = {
  "bfi-southbank": {
    id: "bfi-southbank",
    name: "BFI Southbank",
    shortName: "BFI",
    website: "https://www.bfi.org.uk/bfi-southbank",
    address: { street: "Belvedere Road", area: "South Bank", postcode: "SE1 8XT" },
    features: ["independent", "repertory", "archive", "world-cinema"],
  },
  "bfi-imax": {
    id: "bfi-imax",
    name: "BFI IMAX",
    shortName: "IMAX",
    website: "https://www.bfi.org.uk/bfi-imax",
    address: { street: "1 Charlie Chaplin Walk", area: "Waterloo", postcode: "SE1 8XR" },
    features: ["imax", "blockbusters", "3d"],
  },
};

export interface ImportResult {
  success: boolean;
  pdfScreenings: number;
  changesScreenings: number;
  totalScreenings: number;
  savedScreenings: {
    added: number;
    updated: number;
    failed: number;
  };
  pdfInfo?: {
    label: string;
    contentHash: string;
  };
  changesInfo?: {
    lastUpdated: string | null;
  };
  errors: string[];
  durationMs: number;
}

/**
 * Run the full BFI import pipeline.
 *
 * This is the main entry point for importing BFI screenings from PDFs
 * and programme changes.
 */
export async function runBFIImport(): Promise<ImportResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log("[BFI-Import] Starting BFI import pipeline...");

  let pdfResult: ParseResult | null = null;
  let changesResult: ProgrammeChangesResult | null = null;
  let fetchedPdf: FetchedPDF | null = null;

  // Step 1: Ensure BFI venues exist in database
  console.log("[BFI-Import] Ensuring BFI venues exist...");
  try {
    await ensureCinemaExists(BFI_VENUES["bfi-southbank"]);
    await ensureCinemaExists(BFI_VENUES["bfi-imax"]);
  } catch (error) {
    const errMsg = `Failed to ensure venues exist: ${error}`;
    console.error("[BFI-Import]", errMsg);
    errors.push(errMsg);
  }

  // Step 2: Fetch and parse the latest PDF
  console.log("[BFI-Import] Fetching latest PDF...");
  try {
    fetchedPdf = await fetchLatestPDF();
    if (fetchedPdf) {
      pdfResult = await parsePDF(fetchedPdf);
      console.log(`[BFI-Import] PDF parsed: ${pdfResult.screenings.length} screenings from ${pdfResult.films.length} films`);
    } else {
      errors.push("No PDF found");
    }
  } catch (error) {
    const errMsg = `PDF fetch/parse failed: ${error}`;
    console.error("[BFI-Import]", errMsg);
    errors.push(errMsg);
  }

  // Step 3: Fetch programme changes
  console.log("[BFI-Import] Fetching programme changes...");
  try {
    changesResult = await fetchProgrammeChanges();
    console.log(`[BFI-Import] Changes parsed: ${changesResult.screenings.length} screenings from ${changesResult.changes.length} changes`);
  } catch (error) {
    const errMsg = `Programme changes fetch failed: ${error}`;
    console.error("[BFI-Import]", errMsg);
    errors.push(errMsg);
  }

  // Step 4: Merge and deduplicate screenings
  const allScreenings = mergeScreenings(
    pdfResult?.screenings || [],
    changesResult?.screenings || []
  );

  console.log(`[BFI-Import] Total merged screenings: ${allScreenings.length}`);

  // Step 5: Group by venue and save
  const southbankScreenings = allScreenings.filter(s => {
    const screen = s.screen?.toUpperCase() || "";
    return screen.includes("NFT") || screen.includes("STUDIO") || !screen.includes("IMAX");
  });

  const imaxScreenings = allScreenings.filter(s => {
    const screen = s.screen?.toUpperCase() || "";
    return screen.includes("IMAX");
  });

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalFailed = 0;

  // Save BFI Southbank screenings
  if (southbankScreenings.length > 0) {
    console.log(`[BFI-Import] Saving ${southbankScreenings.length} BFI Southbank screenings...`);
    try {
      const result = await saveScreenings("bfi-southbank", southbankScreenings);
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalFailed += result.failed;
      console.log(`[BFI-Import] BFI Southbank: added=${result.added}, updated=${result.updated}, failed=${result.failed}`);
    } catch (error) {
      const errMsg = `Failed to save Southbank screenings: ${error}`;
      console.error("[BFI-Import]", errMsg);
      errors.push(errMsg);
    }
  }

  // Save BFI IMAX screenings
  if (imaxScreenings.length > 0) {
    console.log(`[BFI-Import] Saving ${imaxScreenings.length} BFI IMAX screenings...`);
    try {
      const result = await saveScreenings("bfi-imax", imaxScreenings);
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalFailed += result.failed;
      console.log(`[BFI-Import] BFI IMAX: added=${result.added}, updated=${result.updated}, failed=${result.failed}`);
    } catch (error) {
      const errMsg = `Failed to save IMAX screenings: ${error}`;
      console.error("[BFI-Import]", errMsg);
      errors.push(errMsg);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(`[BFI-Import] Import complete in ${durationMs}ms`);
  console.log(`[BFI-Import] Results: added=${totalAdded}, updated=${totalUpdated}, failed=${totalFailed}`);

  return {
    success: errors.length === 0,
    pdfScreenings: pdfResult?.screenings.length || 0,
    changesScreenings: changesResult?.screenings.length || 0,
    totalScreenings: allScreenings.length,
    savedScreenings: {
      added: totalAdded,
      updated: totalUpdated,
      failed: totalFailed,
    },
    pdfInfo: fetchedPdf ? {
      label: fetchedPdf.info.label,
      contentHash: fetchedPdf.contentHash,
    } : undefined,
    changesInfo: changesResult ? {
      lastUpdated: changesResult.lastUpdated,
    } : undefined,
    errors,
    durationMs,
  };
}

/**
 * Import only from programme changes (faster, for frequent updates).
 */
export async function runProgrammeChangesImport(): Promise<ImportResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log("[BFI-Import] Starting programme changes import...");

  // Ensure venues exist
  try {
    await ensureCinemaExists(BFI_VENUES["bfi-southbank"]);
    await ensureCinemaExists(BFI_VENUES["bfi-imax"]);
  } catch (error) {
    errors.push(`Failed to ensure venues: ${error}`);
  }

  // Fetch and parse changes
  let changesResult: ProgrammeChangesResult | null = null;
  try {
    changesResult = await fetchProgrammeChanges();
    console.log(`[BFI-Import] Changes: ${changesResult.screenings.length} screenings`);
  } catch (error) {
    const errMsg = `Programme changes fetch failed: ${error}`;
    console.error("[BFI-Import]", errMsg);
    errors.push(errMsg);
  }

  if (!changesResult || changesResult.screenings.length === 0) {
    return {
      success: errors.length === 0,
      pdfScreenings: 0,
      changesScreenings: 0,
      totalScreenings: 0,
      savedScreenings: { added: 0, updated: 0, failed: 0 },
      changesInfo: changesResult ? { lastUpdated: changesResult.lastUpdated } : undefined,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  // Group and save
  const southbankScreenings = changesResult.screenings.filter(s => {
    const screen = s.screen?.toUpperCase() || "";
    return !screen.includes("IMAX");
  });

  const imaxScreenings = changesResult.screenings.filter(s => {
    const screen = s.screen?.toUpperCase() || "";
    return screen.includes("IMAX");
  });

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalFailed = 0;

  if (southbankScreenings.length > 0) {
    try {
      const result = await saveScreenings("bfi-southbank", southbankScreenings);
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalFailed += result.failed;
    } catch (error) {
      errors.push(`Failed to save Southbank: ${error}`);
    }
  }

  if (imaxScreenings.length > 0) {
    try {
      const result = await saveScreenings("bfi-imax", imaxScreenings);
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalFailed += result.failed;
    } catch (error) {
      errors.push(`Failed to save IMAX: ${error}`);
    }
  }

  return {
    success: errors.length === 0,
    pdfScreenings: 0,
    changesScreenings: changesResult.screenings.length,
    totalScreenings: changesResult.screenings.length,
    savedScreenings: {
      added: totalAdded,
      updated: totalUpdated,
      failed: totalFailed,
    },
    changesInfo: {
      lastUpdated: changesResult.lastUpdated,
    },
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Merge screenings from PDF and programme changes.
 * Programme changes take precedence (they're more recent).
 */
function mergeScreenings(
  pdfScreenings: RawScreening[],
  changesScreenings: RawScreening[]
): RawScreening[] {
  // Create a map keyed by film+datetime for deduplication
  const screeningMap = new Map<string, RawScreening>();

  // Add PDF screenings first
  for (const screening of pdfScreenings) {
    const key = createScreeningKey(screening);
    screeningMap.set(key, screening);
  }

  // Add/override with programme changes (more recent)
  for (const screening of changesScreenings) {
    const key = createScreeningKey(screening);
    screeningMap.set(key, screening);
  }

  return Array.from(screeningMap.values());
}

/**
 * Create a unique key for a screening based on film and datetime.
 */
function createScreeningKey(screening: RawScreening): string {
  const titleKey = screening.filmTitle.toLowerCase().replace(/\s+/g, "-");
  const dateKey = screening.datetime.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  return `${titleKey}-${dateKey}`;
}

// Export for use as a scraper function
export async function scrape(): Promise<RawScreening[]> {
  const result = await runBFIImport();
  // Note: screenings are already saved by runBFIImport, but we return them
  // for compatibility with the scraper interface
  return [];
}
