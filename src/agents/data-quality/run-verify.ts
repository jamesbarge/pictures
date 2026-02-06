#!/usr/bin/env npx tsx
/**
 * CLI runner for Data Quality Agent
 *
 * Usage:
 *   npm run agents:verify
 *   npm run agents:verify -- --quick
 *   npm run agents:verify -- --cinema=bfi-southbank
 *   npm run agents:verify -- --recent
 */

import { verifyDataQuality, type DataQualityIssue } from "./index";

function parseArgs(): {
  cinemaId?: string;
  recent: boolean;
  quick: boolean;
  limit?: number;
} {
  const args = process.argv.slice(2);
  const result = {
    recent: false,
    quick: false,
  } as ReturnType<typeof parseArgs>;

  for (const arg of args) {
    if (arg === "--recent") {
      result.recent = true;
    } else if (arg === "--quick") {
      result.quick = true;
    } else if (arg.startsWith("--cinema=")) {
      result.cinemaId = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      result.limit = parseInt(arg.split("=")[1], 10);
    }
  }

  return result;
}

function formatIssue(issue: DataQualityIssue): string {
  const icon = {
    critical: "🔴",
    warning: "🟡",
    info: "🔵",
  }[issue.severity];

  const typeLabel = {
    missing_data: "Missing Data",
    broken_link: "Broken Link",
    duplicate: "Duplicate",
    visual_issue: "Visual Issue",
    invalid_time: "Invalid Time",
  }[issue.type];

  let output = `${icon} [${typeLabel}] ${issue.details}`;
  if (issue.suggestion) {
    output += `\n   💡 ${issue.suggestion}`;
  }
  return output;
}

async function main() {
  const options = parseArgs();

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Data Quality Verification Agent                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("Options:");
  console.log(`  Cinema: ${options.cinemaId || "all"}`);
  console.log(`  Recent only: ${options.recent}`);
  console.log(`  Quick mode: ${options.quick}`);
  if (options.limit) {
    console.log(`  Limit: ${options.limit}`);
  }
  console.log();

  const result = await verifyDataQuality(options);

  if (!result.success) {
    console.error(`\n❌ Verification failed: ${result.error}`);
    process.exit(1);
  }

  const report = result.data!;

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("                        REPORT");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log(`📊 Summary:`);
  console.log(`   Films checked: ${report.filmsChecked}`);
  console.log(`   Screenings checked: ${report.screeningsChecked}`);
  console.log(`   Total issues: ${report.issues.length}`);
  console.log(`     🔴 Critical: ${report.summary.critical}`);
  console.log(`     🟡 Warnings: ${report.summary.warnings}`);
  console.log(`     🔵 Info: ${report.summary.info}`);

  if (report.issues.length > 0) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("                        ISSUES");
    console.log("────────────────────────────────────────────────────────────\n");

    // Group by severity
    const critical = report.issues.filter((i) => i.severity === "critical");
    const warnings = report.issues.filter((i) => i.severity === "warning");
    const info = report.issues.filter((i) => i.severity === "info");

    if (critical.length > 0) {
      console.log("🔴 CRITICAL ISSUES:\n");
      for (const issue of critical) {
        console.log(formatIssue(issue));
        console.log();
      }
    }

    if (warnings.length > 0) {
      console.log("🟡 WARNINGS:\n");
      for (const issue of warnings.slice(0, 20)) {
        console.log(formatIssue(issue));
        console.log();
      }
      if (warnings.length > 20) {
        console.log(`   ... and ${warnings.length - 20} more warnings\n`);
      }
    }

    if (info.length > 0 && info.length <= 10) {
      console.log("🔵 INFO:\n");
      for (const issue of info) {
        console.log(formatIssue(issue));
        console.log();
      }
    } else if (info.length > 10) {
      console.log(`🔵 INFO: ${info.length} informational items (use --verbose to see all)\n`);
    }
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log(`Completed in ${result.executionTimeMs}ms`);
  console.log("════════════════════════════════════════════════════════════\n");

  // Exit with error code if critical issues found
  if (report.summary.critical > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
