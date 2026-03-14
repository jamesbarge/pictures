/**
 * AutoResearch Status — Diagnostic script for experiment history.
 *
 * Queries the autoresearch_experiments table and prints a summary of
 * recent experiments, kept/discarded counts, and best improvements.
 *
 * Usage: npx tsx -r tsconfig-paths/register scripts/autoresearch-status.ts
 */

import { db } from "@/db";
import { autoresearchExperiments } from "@/db/schema/admin";
import { desc } from "drizzle-orm";

async function main() {
  console.log("=== AutoResearch Experiment History ===\n");

  const experiments = await db
    .select()
    .from(autoresearchExperiments)
    .orderBy(desc(autoresearchExperiments.createdAt))
    .limit(50);

  if (experiments.length === 0) {
    console.log("No experiments found in database.");
    process.exit(0);
  }

  // Print individual experiments
  console.log(
    "Date                | System      | Target                          | Before | After  | Kept  | Notes"
  );
  console.log("-".repeat(130));

  for (const exp of experiments) {
    const date = exp.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const system = exp.system.padEnd(11);
    const target = exp.targetId.slice(0, 31).padEnd(31);
    const before = exp.metricBefore.toFixed(1).padStart(6);
    const after = exp.metricAfter.toFixed(1).padStart(6);
    const kept = exp.kept ? "YES  " : "NO   ";
    const notes = (exp.notes ?? "").slice(0, 60);
    console.log(`${date} | ${system} | ${target} | ${before} | ${after} | ${kept} | ${notes}`);
  }

  // Aggregations
  const total = experiments.length;
  const keptCount = experiments.filter((e) => e.kept).length;
  const discardedCount = total - keptCount;

  const bySystem = new Map<string, typeof experiments>();
  for (const exp of experiments) {
    const existing = bySystem.get(exp.system) ?? [];
    existing.push(exp);
    bySystem.set(exp.system, existing);
  }

  console.log(`\n=== Aggregates (last ${total} experiments) ===\n`);
  console.log(`Total: ${total} | Kept: ${keptCount} | Discarded: ${discardedCount}`);

  for (const [system, exps] of bySystem) {
    const sysKept = exps.filter((e) => e.kept);
    const bestImprovement = sysKept.reduce(
      (best, e) => Math.max(best, e.metricAfter - e.metricBefore),
      0
    );
    console.log(
      `  ${system}: ${exps.length} experiments, ${sysKept.length} kept, best improvement: +${bestImprovement.toFixed(1)}`
    );
  }

  // Check for learning accumulation issue
  const qualityExps = experiments
    .filter((e) => e.system === "autoquality")
    .reverse(); // Chronological order

  if (qualityExps.length >= 2) {
    console.log("\n=== Learning Accumulation Check ===\n");

    // Group by run (experiments within ~1 hour of each other)
    const runs: typeof qualityExps[] = [];
    let currentRun: typeof qualityExps = [];

    for (const exp of qualityExps) {
      if (
        currentRun.length === 0 ||
        exp.createdAt.getTime() - currentRun[currentRun.length - 1].createdAt.getTime() <
          3600_000
      ) {
        currentRun.push(exp);
      } else {
        runs.push(currentRun);
        currentRun = [exp];
      }
    }
    if (currentRun.length > 0) runs.push(currentRun);

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const startDqs = run[0].metricBefore;
      const endDqs = run[run.length - 1].kept
        ? run[run.length - 1].metricAfter
        : run[run.length - 1].metricBefore;
      const runDate = run[0].createdAt.toISOString().slice(0, 10);
      console.log(
        `  Run ${i + 1} (${runDate}): DQS ${startDqs.toFixed(1)} → ${endDqs.toFixed(1)} (${run.length} experiments)`
      );

      // Check if next run starts where this one ended
      if (i + 1 < runs.length) {
        const nextStart = runs[i + 1][0].metricBefore;
        if (Math.abs(nextStart - endDqs) > 0.5) {
          console.log(
            `    ⚠️  LEARNING LOST: Next run started at DQS ${nextStart.toFixed(1)}, not ${endDqs.toFixed(1)}`
          );
        } else {
          console.log(`    ✓  Learning preserved: next run started at ${nextStart.toFixed(1)}`);
        }
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
