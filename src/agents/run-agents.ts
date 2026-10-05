#!/usr/bin/env npx tsx
/**
 * CLI runner for the DeepSeek enrichment agent
 *
 * Usage:
 *   npm run agents:enrich        # Enrich up to 20 unmatched films
 *   npm run agents:enrich -- 50  # Enrich up to 50
 */

import { enrichUnmatchedFilms } from "./enrichment";

async function main() {
  const limit = parseInt(process.argv[2] ?? "20", 10);
  console.log(`Running enrichment for up to ${limit} films...`);
  const enrichResult = await enrichUnmatchedFilms(limit);
  if (!enrichResult.success) {
    console.error("Enrichment failed:", enrichResult.error);
    process.exit(1);
  }

  console.log(`\n✓ Found ${enrichResult.data?.length || 0} matches`);
  const applied = enrichResult.data?.filter((r) => r.shouldAutoApply) || [];
  if (applied.length > 0) {
    console.log(`\nAuto-applied matches:`);
    for (const m of applied) {
      console.log(
        `  "${m.originalTitle}" → TMDB ${m.tmdbId} (${(m.confidence * 100).toFixed(0)}%)`
      );
    }
  }
}

main().catch((error) => {
  console.error("Agent runner failed:", error);
  process.exit(1);
});
