/**
 * Manual test for BFI ghost screening cleanup.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/test-bfi-cleanup.ts
 *
 * Add --dry-run to preview what would be deleted without actually deleting.
 */

import { runBFICleanup } from "../src/scrapers/bfi-pdf/cleanup";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\nBFI Ghost Cleanup — ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const result = await runBFICleanup({
    triggeredBy: "manual:test-script",
    dryRun,
  });

  console.log("\n" + "=".repeat(60));
  console.log("RESULT:");
  console.log("=".repeat(60));
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
