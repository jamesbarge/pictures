/**
 * Experiment Logger
 *
 * Records experiment results to the database and generates
 * overnight summary reports sent via Telegram.
 */

import { db, isDatabaseAvailable } from "@/db";
import { autoresearchExperiments } from "@/db/schema/admin";
import { sendTelegramAlert } from "@/trigger/utils/telegram";
import type { ExperimentResult, OvernightSummary, TargetSummary } from "./types";

/** Score thresholds for overnight summary classification */
const RECOVERY_THRESHOLD = 70;
const BROKEN_THRESHOLD = 50;

/**
 * Log a single experiment result to the database.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function logExperiment(result: ExperimentResult): Promise<string | null> {
  if (!isDatabaseAvailable) {
    console.warn("[autoresearch] Database not available — skipping experiment log");
    return null;
  }

  try {
    let targetId = "unknown";
    if (result.system === "autoscrape") {
      targetId = (result.configSnapshot as { cinemaId: string }).cinemaId;
    } else if (result.system === "autoquality") {
      targetId = (result.configSnapshot as { thresholdKey: string }).thresholdKey;
    }

    const [inserted] = await db
      .insert(autoresearchExperiments)
      .values({
        system: result.system,
        targetId,
        configSnapshot: result.configSnapshot,
        metricBefore: result.metricBefore,
        metricAfter: result.metricAfter,
        kept: result.kept,
        notes: result.notes,
        tokensUsed: result.tokensUsed ?? null,
        durationMs: result.durationMs,
      })
      .returning({ id: autoresearchExperiments.id });

    return inserted?.id ?? null;
  } catch (err) {
    console.error("[autoresearch] Failed to log experiment:", err);
    return null;
  }
}

/**
 * Send an overnight summary report via Telegram.
 */
export async function sendOvernightReport(summary: OvernightSummary): Promise<boolean> {
  const durationMin = Math.round(
    (summary.runCompletedAt.getTime() - summary.runStartedAt.getTime()) / 60_000
  );

  const recovered = summary.targetSummaries.filter((t) => t.recovered);
  const needsAttention = summary.targetSummaries.filter((t) => t.needsManualAttention);

  const lines: string[] = [
    `${summary.system.toUpperCase()} Overnight Run`,
    `Duration: ${durationMin}min | Experiments: ${summary.totalExperiments}`,
    `Kept: ${summary.experimentsKept} | Discarded: ${summary.experimentsDiscarded}`,
    "",
  ];

  if (recovered.length > 0) {
    lines.push("RECOVERED:");
    for (const t of recovered) {
      lines.push(`  ${t.targetName}: ${t.metricBefore.toFixed(0)} -> ${t.metricAfter.toFixed(0)}`);
    }
    lines.push("");
  }

  if (needsAttention.length > 0) {
    lines.push("NEEDS MANUAL ATTENTION:");
    for (const t of needsAttention) {
      lines.push(`  ${t.targetName}: score ${t.metricAfter.toFixed(0)} (${t.experimentsRun} experiments tried)`);
    }
    lines.push("");
  }

  if (recovered.length === 0 && needsAttention.length === 0) {
    lines.push("All targets healthy — no action needed.");
  }

  const level = needsAttention.length > 0 ? "warn" : "info";

  return sendTelegramAlert({
    title: `AutoResearch: ${summary.system}`,
    message: lines.join("\n"),
    level,
  });
}

/**
 * Build an OvernightSummary from a list of experiment results grouped by target.
 */
export function buildOvernightSummary(
  system: OvernightSummary["system"],
  startedAt: Date,
  completedAt: Date,
  resultsByTarget: Map<string, { name: string; results: ExperimentResult[] }>
): OvernightSummary {
  const targetSummaries: TargetSummary[] = [];
  let totalExperiments = 0;
  let experimentsKept = 0;
  let experimentsDiscarded = 0;

  for (const [targetId, { name, results }] of resultsByTarget) {
    totalExperiments += results.length;
    const kept = results.filter((r) => r.kept);
    const discarded = results.filter((r) => !r.kept);
    experimentsKept += kept.length;
    experimentsDiscarded += discarded.length;

    const firstMetric = results[0]?.metricBefore ?? 0;
    const lastKept = results.filter((r) => r.kept).pop();
    const lastMetric = lastKept?.metricAfter ?? firstMetric;
    const recovered = lastMetric >= RECOVERY_THRESHOLD && firstMetric < BROKEN_THRESHOLD;

    targetSummaries.push({
      targetId,
      targetName: name,
      metricBefore: firstMetric,
      metricAfter: lastMetric,
      experimentsRun: results.length,
      recovered,
      needsManualAttention: lastMetric < BROKEN_THRESHOLD && !recovered,
    });
  }

  return {
    system,
    runStartedAt: startedAt,
    runCompletedAt: completedAt,
    totalExperiments,
    experimentsKept,
    experimentsDiscarded,
    targetSummaries,
  };
}
