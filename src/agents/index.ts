/**
 * Cinema Data Quality Agents
 *
 * This module exports all Claude Agent SDK-powered agents
 * for maintaining data quality in the cinema calendar.
 *
 * Agents operate with AGGRESSIVE autonomy:
 * - Auto-fix issues when confidence > 0.5
 * - Auto-apply TMDB matches when confidence > 0.8
 * - Auto-block broken scrapes
 * - Only flag truly uncertain cases for human review
 */

// Re-export all agents
export * from "./link-validator";
export * from "./scraper-health";
export * from "./enrichment";

// Export types and config
export * from "./types";
export * from "./config";

// Convenience imports for internal usage
import { verifySampleOfUpcomingLinks } from "./link-validator";
import { runHealthCheckAllCinemas } from "./scraper-health";
import { enrichUnmatchedFilms } from "./enrichment";

/**
 * Run all agents in a comprehensive data quality check
 */
export async function runFullDataQualityCheck() {
  console.log("=== Starting Full Data Quality Check ===\n");
  const startTime = Date.now();

  // 1. Check scraper health for all cinemas
  console.log("[1/3] Running scraper health checks...");
  const healthResult = await runHealthCheckAllCinemas();
  if (healthResult.success && healthResult.data) {
    const anomalies = healthResult.data.filter((r) => r.anomalyDetected);
    console.log(
      `  ✓ Checked ${healthResult.data.length} cinemas, ${anomalies.length} anomalies detected`
    );
    for (const anomaly of anomalies) {
      console.log(
        `    ⚠ ${anomaly.cinemaName}: ${anomaly.warnings.join(", ")}`
      );
    }
  }

  // 2. Verify sample of booking links
  console.log("\n[2/3] Verifying booking links...");
  const linkResult = await verifySampleOfUpcomingLinks(30);
  if (linkResult.success && linkResult.data) {
    const broken = linkResult.data.filter((r) => r.status === "broken");
    console.log(
      `  ✓ Verified ${linkResult.data.length} links, ${broken.length} broken`
    );
  }

  // 3. Enrich unmatched films
  console.log("\n[3/3] Enriching unmatched films...");
  const enrichResult = await enrichUnmatchedFilms(15);
  if (enrichResult.success && enrichResult.data) {
    const autoApplied = enrichResult.data.filter((r) => r.shouldAutoApply);
    console.log(
      `  ✓ Found ${enrichResult.data.length} matches, auto-applied ${autoApplied.length}`
    );
  }

  const totalTime = Date.now() - startTime;
  const totalTokens =
    (healthResult.tokensUsed || 0) +
    (linkResult.tokensUsed || 0) +
    (enrichResult.tokensUsed || 0);

  console.log("\n=== Data Quality Check Complete ===");
  console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`Total tokens used: ${totalTokens}`);

  return {
    health: healthResult,
    links: linkResult,
    enrichment: enrichResult,
    totalTimeMs: totalTime,
    totalTokens,
  };
}
