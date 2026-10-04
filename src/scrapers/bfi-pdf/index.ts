/**
 * BFI PDF Scraper
 *
 * Cloud-runnable BFI Southbank scraper that uses:
 * 1. Monthly PDF guides (accessible version) as the primary source
 * 2. Programme changes page for updates
 *
 * No Playwright required - can run on Vercel serverless.
 */

export { loadBFIScreenings, getBFIVenueKey, runBFIImport, runProgrammeChangesImport } from "./importer";
