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

import { fetchLatestPDF, type FetchedPDF } from "./fetcher";
import { parsePDF, type ParseResult } from "./pdf-parser";
import { fetchProgrammeChanges, type ProgrammeChangesResult } from "./programme-changes-parser";
import { saveScreenings, ensureCinemaExists } from "../pipeline";
import type { RawScreening } from "../types";
import { db, isDatabaseAvailable } from "@/db";
import { bfiImportRuns } from "@/db/schema";

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
  status: "success" | "degraded" | "failed";
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
  sourceStatus: {
    pdf: "success" | "empty" | "failed";
    programmeChanges: "success" | "empty" | "failed";
  };
  errorCodes: string[];
  errors: string[];
  durationMs: number;
}

interface ImportError {
  code: string;
  message: string;
}

interface ImportContext {
  triggeredBy?: string;
}

type ImportRunType = "full" | "changes";
type SourceStatus = "success" | "empty" | "failed";

function pushError(errors: ImportError[], code: string, message: string) {
  errors.push({ code, message });
  console.error("[BFI-Import]", `[${code}] ${message}`);
}

function toImportResult(
  params: {
    pdfScreenings: number;
    changesScreenings: number;
    totalScreenings: number;
    savedScreenings: { added: number; updated: number; failed: number };
    pdfInfo?: { label: string; contentHash: string };
    changesInfo?: { lastUpdated: string | null };
    sourceStatus: { pdf: SourceStatus; programmeChanges: SourceStatus };
    errors: ImportError[];
    durationMs: number;
    allowEmpty?: boolean;
  }
): ImportResult {
  const { sourceStatus, errors, totalScreenings, allowEmpty, ...base } = params;
  const hasSourceFailure = sourceStatus.pdf === "failed" || sourceStatus.programmeChanges === "failed";
  const hasAnyScreenings = totalScreenings > 0;

  let status: ImportResult["status"] = "success";
  if (!hasAnyScreenings && !allowEmpty) {
    status = "failed";
  } else if (hasSourceFailure || errors.length > 0) {
    status = "degraded";
  }

  return {
    ...base,
    totalScreenings,
    status,
    success: status !== "failed",
    sourceStatus,
    errors: errors.map((error) => error.message),
    errorCodes: errors.map((error) => error.code),
  };
}

async function persistImportRun(
  result: ImportResult,
  runType: ImportRunType,
  startedAt: Date,
  triggeredBy?: string
): Promise<void> {
  if (!isDatabaseAvailable) return;

  try {
    await db.insert(bfiImportRuns).values({
      runType,
      status: result.status,
      triggeredBy: triggeredBy || "unknown",
      sourceStatus: result.sourceStatus,
      pdfScreenings: result.pdfScreenings,
      changesScreenings: result.changesScreenings,
      totalScreenings: result.totalScreenings,
      added: result.savedScreenings.added,
      updated: result.savedScreenings.updated,
      failed: result.savedScreenings.failed,
      errorCodes: result.errorCodes,
      errors: result.errors,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + result.durationMs),
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error("[BFI-Import] Failed to persist run record:", error);
  }
}

async function sendDegradedAlert(
  result: ImportResult,
  runType: ImportRunType,
  triggeredBy?: string
): Promise<void> {
  if (result.status === "success") return;

  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!slackWebhookUrl) return;

  const failedSources = Object.entries(result.sourceStatus)
    .filter(([, status]) => status === "failed")
    .map(([name]) => name);

  const title = result.status === "failed" ? "🚨 BFI Import Failed" : "⚠️ BFI Import Degraded";
  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: title, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Run Type:*\n${runType}` },
          { type: "mrkdwn", text: `*Status:*\n${result.status}` },
          { type: "mrkdwn", text: `*Triggered By:*\n${triggeredBy || "unknown"}` },
          { type: "mrkdwn", text: `*Duration:*\n${result.durationMs}ms` },
        ],
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*PDF Source:*\n${result.sourceStatus.pdf}` },
          { type: "mrkdwn", text: `*Changes Source:*\n${result.sourceStatus.programmeChanges}` },
          { type: "mrkdwn", text: `*Total Screenings:*\n${result.totalScreenings}` },
          {
            type: "mrkdwn",
            text: `*Failed Sources:*\n${failedSources.length > 0 ? failedSources.join(", ") : "none"}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            result.errorCodes.length > 0
              ? `*Error Codes:*\n\`${result.errorCodes.join("`, `")}\``
              : "*Error Codes:*\nNone",
        },
      },
    ],
  };

  try {
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("[BFI-Import] Failed to send degraded alert:", response.status);
    }
  } catch (error) {
    console.error("[BFI-Import] Failed to send degraded alert:", error);
  }
}

async function finalizeImportResult(
  result: ImportResult,
  runType: ImportRunType,
  startedAt: Date,
  triggeredBy?: string
): Promise<ImportResult> {
  await Promise.all([
    persistImportRun(result, runType, startedAt, triggeredBy),
    sendDegradedAlert(result, runType, triggeredBy),
  ]);

  return result;
}

/**
 * Run the full BFI import pipeline.
 *
 * This is the main entry point for importing BFI screenings from PDFs
 * and programme changes.
 */
/**
 * Fetch + parse + merge BFI screenings WITHOUT saving. Use this when you
 * want the screenings returned for processing through the standard scraper
 * pipeline (e.g. from `BFIScraper.scrape()` so the unified /scrape records
 * the correct screening_count per cinema in `scraper_runs`).
 *
 * For the standalone CLI path (`npm run scrape:bfi-pdf`), use `runBFIImport`
 * which calls this and then saves + persists a run record.
 */
export async function loadBFIScreenings(): Promise<{
  screenings: RawScreening[];
  pdfInfo: { label: string; contentHash: string } | undefined;
  sourceStatus: { pdf: SourceStatus; programmeChanges: SourceStatus };
}> {
  const sourceStatus: { pdf: SourceStatus; programmeChanges: SourceStatus } = {
    pdf: "empty",
    programmeChanges: "empty",
  };

  let pdfResult: ParseResult | null = null;
  let changesResult: ProgrammeChangesResult | null = null;
  let fetchedPdf: FetchedPDF | null = null;

  console.log("[BFI-Load] Fetching latest PDF...");
  try {
    fetchedPdf = await fetchLatestPDF();
    if (fetchedPdf) {
      pdfResult = await parsePDF(fetchedPdf);
      sourceStatus.pdf = pdfResult.screenings.length > 0 ? "success" : "empty";
      console.log(`[BFI-Load] PDF parsed: ${pdfResult.screenings.length} screenings from ${pdfResult.films.length} films`);
    } else {
      sourceStatus.pdf = "failed";
    }
  } catch (error) {
    sourceStatus.pdf = "failed";
    console.error(`[BFI-Load] PDF fetch/parse failed:`, error);
  }

  console.log("[BFI-Load] Fetching programme changes...");
  try {
    changesResult = await fetchProgrammeChanges();
    sourceStatus.programmeChanges = changesResult.screenings.length > 0 ? "success" : "empty";
    console.log(`[BFI-Load] Changes parsed: ${changesResult.screenings.length} screenings from ${changesResult.changes.length} changes`);
  } catch (error) {
    sourceStatus.programmeChanges = "failed";
    console.error(`[BFI-Load] Programme changes fetch failed:`, error);
  }

  const screenings = mergeScreenings(
    pdfResult?.screenings || [],
    changesResult?.screenings || []
  );

  return {
    screenings,
    pdfInfo: fetchedPdf
      ? { label: fetchedPdf.info.label, contentHash: fetchedPdf.contentHash }
      : undefined,
    sourceStatus,
  };
}

export async function runBFIImport(context?: ImportContext): Promise<ImportResult> {
  const startedAt = new Date();
  const startTime = Date.now();
  const errors: ImportError[] = [];
  const sourceStatus: { pdf: SourceStatus; programmeChanges: SourceStatus } = {
    pdf: "empty",
    programmeChanges: "empty",
  };

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
    pushError(errors, "VENUE_INIT_FAILED", `Failed to ensure venues exist: ${error}`);
  }

  // Step 2: Fetch and parse the latest PDF
  console.log("[BFI-Import] Fetching latest PDF...");
  try {
    fetchedPdf = await fetchLatestPDF();
    if (fetchedPdf) {
      pdfResult = await parsePDF(fetchedPdf);
      sourceStatus.pdf = pdfResult.screenings.length > 0 ? "success" : "empty";
      console.log(`[BFI-Import] PDF parsed: ${pdfResult.screenings.length} screenings from ${pdfResult.films.length} films`);
    } else {
      sourceStatus.pdf = "failed";
      pushError(errors, "PDF_NOT_FOUND", "No PDF found");
    }
  } catch (error) {
    sourceStatus.pdf = "failed";
    pushError(errors, "PDF_FETCH_PARSE_FAILED", `PDF fetch/parse failed: ${error}`);
  }

  // Step 3: Fetch programme changes
  console.log("[BFI-Import] Fetching programme changes...");
  try {
    changesResult = await fetchProgrammeChanges();
    sourceStatus.programmeChanges = changesResult.screenings.length > 0 ? "success" : "empty";
    console.log(`[BFI-Import] Changes parsed: ${changesResult.screenings.length} screenings from ${changesResult.changes.length} changes`);
  } catch (error) {
    sourceStatus.programmeChanges = "failed";
    pushError(errors, "PROGRAMME_CHANGES_FAILED", `Programme changes fetch failed: ${error}`);
  }

  // Step 4: Merge and deduplicate screenings
  const allScreenings = mergeScreenings(
    pdfResult?.screenings || [],
    changesResult?.screenings || []
  );

  console.log(`[BFI-Import] Total merged screenings: ${allScreenings.length}`);
  if (allScreenings.length === 0) {
    pushError(errors, "NO_SCREENINGS_PARSED", "No screenings found from PDF or programme changes");
  }

  // Step 5: Save screenings grouped by venue
  const { added: totalAdded, updated: totalUpdated, failed: totalFailed } =
    await saveByVenue(allScreenings, errors);

  const durationMs = Date.now() - startTime;

  console.log(`[BFI-Import] Import complete in ${durationMs}ms`);
  console.log(`[BFI-Import] Results: added=${totalAdded}, updated=${totalUpdated}, failed=${totalFailed}`);

  const result = toImportResult({
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
    sourceStatus,
    errors,
    durationMs,
  });

  return finalizeImportResult(result, "full", startedAt, context?.triggeredBy);
}

/**
 * Import only from programme changes (faster, for frequent updates).
 */
export async function runProgrammeChangesImport(context?: ImportContext): Promise<ImportResult> {
  const startedAt = new Date();
  const startTime = Date.now();
  const errors: ImportError[] = [];
  const sourceStatus: { pdf: SourceStatus; programmeChanges: SourceStatus } = {
    pdf: "empty",
    programmeChanges: "empty",
  };

  console.log("[BFI-Import] Starting programme changes import...");

  // Ensure venues exist
  try {
    await ensureCinemaExists(BFI_VENUES["bfi-southbank"]);
    await ensureCinemaExists(BFI_VENUES["bfi-imax"]);
  } catch (error) {
    pushError(errors, "VENUE_INIT_FAILED", `Failed to ensure venues: ${error}`);
  }

  // Fetch and parse changes
  let changesResult: ProgrammeChangesResult | null = null;
  try {
    changesResult = await fetchProgrammeChanges();
    sourceStatus.programmeChanges = changesResult.screenings.length > 0 ? "success" : "empty";
    console.log(`[BFI-Import] Changes: ${changesResult.screenings.length} screenings`);
  } catch (error) {
    sourceStatus.programmeChanges = "failed";
    pushError(errors, "PROGRAMME_CHANGES_FAILED", `Programme changes fetch failed: ${error}`);
  }

  if (!changesResult || changesResult.screenings.length === 0) {
    const result = toImportResult({
      pdfScreenings: 0,
      changesScreenings: 0,
      totalScreenings: 0,
      savedScreenings: { added: 0, updated: 0, failed: 0 },
      changesInfo: changesResult ? { lastUpdated: changesResult.lastUpdated } : undefined,
      sourceStatus,
      errors,
      durationMs: Date.now() - startTime,
      allowEmpty: true,
    });
    return finalizeImportResult(result, "changes", startedAt, context?.triggeredBy);
  }

  // Group and save
  const { added: totalAdded, updated: totalUpdated, failed: totalFailed } =
    await saveByVenue(changesResult.screenings, errors);

  const result = toImportResult({
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
    sourceStatus,
    errors,
    durationMs: Date.now() - startTime,
    allowEmpty: true,
  });
  return finalizeImportResult(result, "changes", startedAt, context?.triggeredBy);
}

/**
 * Group screenings by BFI venue and save each batch.
 * Shared between full import and programme-changes-only import.
 */
async function saveByVenue(
  allScreenings: RawScreening[],
  errors: ImportError[],
): Promise<{ added: number; updated: number; failed: number }> {
  const venues = [
    { id: "bfi-southbank", name: "BFI Southbank", errorCode: "SAVE_SOUTHBANK_FAILED" },
    { id: "bfi-imax", name: "BFI IMAX", errorCode: "SAVE_IMAX_FAILED" },
  ] as const;

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalFailed = 0;

  for (const venue of venues) {
    const venueScreenings = allScreenings.filter((s) => getVenueKey(s) === venue.id);
    if (venueScreenings.length === 0) continue;

    console.log(`[BFI-Import] Saving ${venueScreenings.length} ${venue.name} screenings...`);
    try {
      const result = await saveScreenings(venue.id, venueScreenings);
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalFailed += result.failed;
      console.log(`[BFI-Import] ${venue.name}: added=${result.added}, updated=${result.updated}, failed=${result.failed}`);
    } catch (error) {
      pushError(errors, venue.errorCode, `Failed to save ${venue.name} screenings: ${error}`);
    }
  }

  return { added: totalAdded, updated: totalUpdated, failed: totalFailed };
}

/**
 * Merge screenings from PDF and programme changes.
 * Programme changes take precedence (they're more recent).
 */
function mergeScreenings(
  pdfScreenings: RawScreening[],
  changesScreenings: RawScreening[]
): RawScreening[] {
  // Create a map keyed by film+datetime+screen for deduplication
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

function isImaxBookingUrl(bookingUrl: string | undefined): boolean {
  if (!bookingUrl) return false;

  try {
    const parsed = new URL(bookingUrl);
    const pathname = parsed.pathname.toLowerCase();
    const hostAndPath = `${parsed.hostname.toLowerCase()}${pathname}`;
    return hostAndPath.includes("bfiimax") || /\/imax(?:\/|$)/.test(pathname);
  } catch {
    const normalized = bookingUrl.toLowerCase();
    return normalized.includes("bfiimax") || normalized.includes("/imax/");
  }
}

export function getBFIVenueKey(screening: RawScreening): "bfi-southbank" | "bfi-imax" {
  const screen = screening.screen?.toUpperCase() || "";
  if (screen.includes("IMAX") || isImaxBookingUrl(screening.bookingUrl)) {
    return "bfi-imax";
  }
  return "bfi-southbank";
}

// Internal alias preserved for legacy call-sites inside this file.
const getVenueKey = getBFIVenueKey;

/**
 * Create a unique key for a screening based on venue, film, datetime, and screen.
 */
function createScreeningKey(screening: RawScreening): string {
  const venueKey = getVenueKey(screening);
  const titleKey = screening.filmTitle.toLowerCase().replace(/\s+/g, "-");
  const dateKey = screening.datetime.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  const screenKey = (screening.screen || "unknown")
    .toLowerCase()
    .replace(/\s+/g, "-");
  return `${venueKey}-${titleKey}-${dateKey}-${screenKey}`;
}

// Export for use as a scraper function
export async function scrape(): Promise<RawScreening[]> {
  await runBFIImport();
  // Note: screenings are already saved by runBFIImport, but we return them
  // for compatibility with the scraper interface
  return [];
}
