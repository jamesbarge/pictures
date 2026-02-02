#!/usr/bin/env npx tsx
/**
 * CLI runner for fallback enrichment agent
 *
 * Usage:
 *   npm run agents:fallback-enrich           # Process 20 films
 *   npm run agents:fallback-enrich -- 50     # Process 50 films
 *   npm run agents:fallback-enrich -- --dry  # Dry run (no DB writes)
 */

import { runFallbackEnrichment } from "./index";
import { validateEnvironment } from "../config";

async function main() {
  const args = process.argv.slice(2);

  // Validate environment
  try {
    validateEnvironment();
  } catch (error) {
    console.error("Environment validation failed:", error);
    process.exit(1);
  }

  // Parse args
  const dryRun = args.includes("--dry");
  const limitArg = args.find((a) => /^\d+$/.test(a));
  const limit = limitArg ? parseInt(limitArg, 10) : 20;

  console.log("\n🎬 Fallback Film Enrichment Agent\n");
  console.log(`Limit: ${limit} films`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no DB writes)" : "LIVE (will update DB)"}\n`);

  const result = await runFallbackEnrichment({
    limit,
    autoApply: !dryRun,
    confidenceThreshold: 0.8,
  });

  if (result.success && result.data) {
    console.log(`\nResults:`);
    console.log(`  Processed:    ${result.data.processed}`);
    console.log(`  Auto-applied: ${result.data.autoApplied}`);
    console.log(`  Needs review: ${result.data.needsReview}`);
    console.log(`  Skipped:      ${result.data.skipped}`);
    console.log(`  Tokens used:  ${result.tokensUsed}`);
    console.log(`  Time:         ${(result.executionTimeMs / 1000).toFixed(1)}s`);
  } else {
    console.error("Enrichment failed:", result.error);
    process.exit(1);
  }

  console.log("\n✨ Done!\n");
}

main().catch((error) => {
  console.error("Fallback enrichment runner failed:", error);
  process.exit(1);
});
