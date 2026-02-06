/**
 * BFI PDF Scraper Runner
 *
 * Manual runner for testing the BFI PDF import pipeline.
 *
 * Usage:
 *   npm run scrape:bfi-pdf          # Full import (PDF + changes)
 *   npm run scrape:bfi-pdf changes  # Just programme changes
 */

import { runBFIImport, runProgrammeChangesImport } from "./importer";

async function main() {
  const args = process.argv.slice(2);
  const changesOnly = args.includes("changes") || args.includes("--changes");

  console.log("=".repeat(60));
  console.log("BFI PDF Scraper");
  console.log("=".repeat(60));
  console.log(`Mode: ${changesOnly ? "Programme Changes Only" : "Full Import (PDF + Changes)"}`);
  console.log("=".repeat(60));
  console.log();

  try {
    const result = changesOnly
      ? await runProgrammeChangesImport({ triggeredBy: "cli:bfi-changes" })
      : await runBFIImport({ triggeredBy: "cli:bfi-full" });

    console.log();
    console.log("=".repeat(60));
    console.log("IMPORT RESULTS");
    console.log("=".repeat(60));
    console.log(`Status: ${result.status.toUpperCase()} (${result.success ? "success" : "failed"})`);
    console.log(`Duration: ${result.durationMs}ms`);
    console.log();

    console.log("Source Status:");
    console.log(`  PDF: ${result.sourceStatus.pdf}`);
    console.log(`  Programme Changes: ${result.sourceStatus.programmeChanges}`);
    console.log();

    if (result.pdfInfo) {
      console.log("PDF Source:");
      console.log(`  Label: ${result.pdfInfo.label}`);
      console.log(`  Hash: ${result.pdfInfo.contentHash.slice(0, 16)}...`);
      console.log(`  Screenings: ${result.pdfScreenings}`);
    }

    if (result.changesInfo) {
      console.log("Programme Changes:");
      console.log(`  Last Updated: ${result.changesInfo.lastUpdated || "Unknown"}`);
      console.log(`  Screenings: ${result.changesScreenings}`);
    }

    console.log();
    console.log("Database Results:");
    console.log(`  Added: ${result.savedScreenings.added}`);
    console.log(`  Updated: ${result.savedScreenings.updated}`);
    console.log(`  Failed: ${result.savedScreenings.failed}`);
    console.log(`  Total Processed: ${result.totalScreenings}`);

    if (result.errors.length > 0) {
      console.log();
      console.log("Errors:");
      result.errors.forEach((err, i) => {
        const code = result.errorCodes[i];
        console.log(`  ${i + 1}. [${code}] ${err}`);
      });
    }

    console.log();
    console.log("=".repeat(60));

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
