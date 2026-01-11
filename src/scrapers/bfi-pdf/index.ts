/**
 * BFI PDF Scraper
 *
 * Cloud-runnable BFI Southbank scraper that uses:
 * 1. Monthly PDF guides (accessible version) as the primary source
 * 2. Programme changes page for updates
 *
 * No Playwright required - can run on Vercel serverless.
 */

export { discoverPDFs, downloadPDF, fetchLatestPDF, fetchAllRelevantPDFs } from "./fetcher";
export type { PDFInfo, FetchedPDF } from "./fetcher";

export { parsePDF, parsePDFFromPath } from "./pdf-parser";
export type { ParsedFilm, ParsedScreening, ParseResult } from "./pdf-parser";

export { fetchProgrammeChanges, parseChangesPage } from "./programme-changes-parser";
export type { ProgrammeChange, ParsedChangeScreening, ProgrammeChangesResult } from "./programme-changes-parser";

export { runBFIImport, runProgrammeChangesImport, scrape } from "./importer";
export type { ImportResult } from "./importer";
