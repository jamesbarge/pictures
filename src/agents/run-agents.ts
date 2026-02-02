#!/usr/bin/env npx tsx
/**
 * CLI runner for cinema data quality agents
 *
 * Usage:
 *   npm run agents              # Run all agents
 *   npm run agents:links        # Run link verification only
 *   npm run agents:health       # Run scraper health check only
 *   npm run agents:enrich       # Run enrichment only
 */

import { runFullDataQualityCheck } from "./index";
import { verifySampleOfUpcomingLinks } from "./link-validator";
import { runHealthCheckAllCinemas } from "./scraper-health";
import { enrichUnmatchedFilms } from "./enrichment";
import { validateEnvironment } from "./config";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "all";

  // Validate environment
  try {
    validateEnvironment();
  } catch (error) {
    console.error("Environment validation failed:", error);
    process.exit(1);
  }

  console.log(`\n🎬 Cinema Data Quality Agents\n`);
  console.log(`Running: ${command}\n`);

  switch (command) {
    case "all":
      await runFullDataQualityCheck();
      break;

    case "links":
      console.log("Running link verification...");
      const linkResult = await verifySampleOfUpcomingLinks(50);
      if (linkResult.success) {
        console.log(`✓ Verified ${linkResult.data?.length || 0} links`);
        const broken = linkResult.data?.filter((r) => r.status === "broken") || [];
        if (broken.length > 0) {
          console.log(`\n⚠ Broken links:`);
          for (const link of broken) {
            console.log(`  - ${link.screeningId}: ${link.error || link.url}`);
          }
        }
      } else {
        console.error("Link verification failed:", linkResult.error);
      }
      break;

    case "health":
      console.log("Running scraper health checks...");
      const healthResult = await runHealthCheckAllCinemas();
      if (healthResult.success) {
        console.log(
          `\n✓ Checked ${healthResult.data?.length || 0} cinemas`
        );
        const anomalies = healthResult.data?.filter((r) => r.anomalyDetected) || [];
        if (anomalies.length > 0) {
          console.log(`\n⚠ Anomalies detected:`);
          for (const a of anomalies) {
            console.log(`  ${a.cinemaName}:`);
            for (const w of a.warnings) {
              console.log(`    - ${w}`);
            }
          }
        }
      } else {
        console.error("Health check failed:", healthResult.error);
      }
      break;

    case "enrich":
      const limitArg = args[1];
      const limit = limitArg ? parseInt(limitArg, 10) : 20;
      console.log(`Running enrichment for up to ${limit} films...`);
      const enrichResult = await enrichUnmatchedFilms(limit);
      if (enrichResult.success) {
        console.log(
          `\n✓ Found ${enrichResult.data?.length || 0} matches`
        );
        const applied = enrichResult.data?.filter((r) => r.shouldAutoApply) || [];
        if (applied.length > 0) {
          console.log(`\nAuto-applied matches:`);
          for (const m of applied) {
            console.log(
              `  "${m.originalTitle}" → TMDB ${m.tmdbId} (${(m.confidence * 100).toFixed(0)}%)`
            );
          }
        }
      } else {
        console.error("Enrichment failed:", enrichResult.error);
      }
      break;

    case "fallback": {
      const fbLimitArg = args[1];
      const fbLimit = fbLimitArg ? parseInt(fbLimitArg, 10) : 20;
      console.log(`Running fallback enrichment for up to ${fbLimit} films...`);
      const { runFallbackEnrichment } = await import("./fallback-enrichment");
      const fbResult = await runFallbackEnrichment({ limit: fbLimit });
      if (fbResult.success && fbResult.data) {
        console.log(
          `\n✓ Processed ${fbResult.data.processed} films: ${fbResult.data.autoApplied} auto-applied, ${fbResult.data.needsReview} need review`
        );
      } else {
        console.error("Fallback enrichment failed:", fbResult.error);
      }
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`\nAvailable commands:`);
      console.log(`  all      - Run all agents (default)`);
      console.log(`  links    - Run link verification`);
      console.log(`  health   - Run scraper health checks`);
      console.log(`  enrich   - Run film enrichment`);
      console.log(`  fallback - Run fallback enrichment (web search)`);
      process.exit(1);
  }

  console.log(`\n✨ Done!\n`);
}

main().catch((error) => {
  console.error("Agent runner failed:", error);
  process.exit(1);
});
