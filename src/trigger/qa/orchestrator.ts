/**
 * QA Orchestrator — Daily QA Pipeline Coordinator
 *
 * Two exported tasks:
 *   1. qaOrchestrator (schedules.task) — Cron trigger, daily 6am UTC
 *   2. qaPipeline (task) — The actual pipeline logic, API-triggerable
 *
 * The cron wrapper delegates to qaPipeline so that both scheduled runs
 * and on-demand API triggers use the same regular task type, which
 * Trigger.dev dispatches reliably.
 */

import { schedules, task, tasks } from "@trigger.dev/sdk/v3";
import { sendTelegramAlert } from "../utils/telegram";
import { createGitHubIssue } from "../utils/github-issues";
import type { QaBrowseOutput, QaAnalysisOutput, QaOrchestratorOutput, ClassifiedIssue } from "./types";

/** Trigger a child QA task, wait for completion, and send Telegram alerts on failure. */
async function triggerQaStep<TOutput>(
  taskId: string,
  payload: Record<string, unknown>,
  label: string,
  alertTitle: string,
  failContext?: string,
): Promise<TOutput> {
  try {
    const handle = await tasks.triggerAndWait(taskId, payload);
    if (!handle.ok) {
      const errMsg = handle.error instanceof Error
        ? handle.error.message
        : String(handle.error ?? "unknown");
      console.error(`[qa] ${label} task failed: ${errMsg}`);
      const message = failContext
        ? `${label} task failed ${failContext}.\nError: ${errMsg}`
        : `${label} task failed: ${errMsg}`;
      await sendTelegramAlert({ title: alertTitle, message, level: "error" });
      throw new Error(`${label} failed: ${errMsg}`);
    }
    return handle.output as TOutput;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(`${label} failed:`)) throw err;
    const errMsg = err instanceof Error ? err.message : String(err);
    await sendTelegramAlert({ title: alertTitle, message: `${label} task error: ${errMsg}`, level: "error" });
    throw err;
  }
}

// ── Regular task: the actual pipeline (API-triggerable) ──────────────
export const qaPipeline = task({
  id: "qa-pipeline",
  maxDuration: 3600, // 60 min budget
  retry: { maxAttempts: 0 },
  run: async (payload: { dryRun?: boolean; triggeredBy?: string }): Promise<QaOrchestratorOutput> => {
    const dryRun = payload.dryRun ?? true; // Default true for safety

    console.log(`[qa] Starting QA pipeline, dryRun=${dryRun}`);

    // ── Step 1: Browse ─────────────────────────────────────────────
    const browseOutput = await triggerQaStep<QaBrowseOutput>(
      "qa-browse", { dryRun }, "Browse", "QA Pipeline Failed",
    );

    // Check if browse returned empty (completeness guard fired)
    if (browseOutput.films.length === 0 && browseOutput.errors.length > 0) {
      console.warn("[qa] Browse returned empty — completeness guard likely fired");
      await sendTelegramAlert({
        title: "QA Pipeline Aborted",
        message: `Completeness guard: ${browseOutput.errors.map((e) => e.message).join("; ")}`,
        level: "warn",
      });
      return {
        skipped: true,
        reason: "completeness_guard",
        browseStats: browseOutput.stats,
      };
    }

    // ── Step 2: Analyze & Fix ──────────────────────────────────────
    const analysisOutput = await triggerQaStep<QaAnalysisOutput>(
      "qa-analyze-and-fix",
      { browseOutput, dryRun },
      "Analyze",
      "QA Analysis Failed",
      `after successful browse.\nBrowse found ${browseOutput.films.length} films`,
    );

    // ── Step 3: Telegram Report ────────────────────────────────────
    await sendQaReport(browseOutput, analysisOutput, dryRun);

    // ── Step 4: GitHub Issues for systemic problems ──────────────
    await createSystemicGitHubIssues(analysisOutput, dryRun);

    return {
      browseStats: browseOutput.stats,
      analysisStats: analysisOutput.stats,
      issueCount: analysisOutput.stats.totalIssues,
      fixCount: analysisOutput.stats.fixesApplied,
    };
  },
});

// ── Scheduled task: thin cron wrapper ────────────────────────────────
export const qaOrchestrator = schedules.task({
  id: "qa-orchestrator",
  cron: "0 6 * * *", // Daily 6am UTC (7am BST)
  maxDuration: 3600,
  retry: { maxAttempts: 0 },
  run: async () => {
    // Monday overlap guard: scrape-all runs at 3am UTC on Mondays
    const now = new Date();
    if (now.getUTCDay() === 1 && now.getUTCHours() < 5) {
      console.log("[qa] Skipping — Monday early morning, scrape-all may be running");
      return { skipped: true, reason: "monday_overlap_guard" };
    }

    // Delegate to the regular task (which is API-triggerable)
    const handle = await tasks.triggerAndWait<typeof qaPipeline>(
      "qa-pipeline",
      { dryRun: true } // Cron runs default to dry-run for safety
    );

    if (!handle.ok) {
      throw new Error(`QA pipeline failed: ${handle.error}`);
    }

    return handle.output;
  },
});

async function sendQaReport(
  browse: QaBrowseOutput,
  analysis: QaAnalysisOutput,
  dryRun: boolean
): Promise<void> {
  const dryRunLabel = dryRun ? " [DRY RUN]" : "";

  // Part 1: Findings Summary
  const issuesByType = new Map<string, number>();
  for (const issue of analysis.issuesFound) {
    issuesByType.set(issue.type, (issuesByType.get(issue.type) ?? 0) + 1);
  }
  const systemicIssues = analysis.issuesFound.filter((i) => i.scope === "systemic");

  const issueSummaryLines = Array.from(issuesByType.entries())
    .map(([type, count]) => {
      const systemic = systemicIssues.filter((i) => i.type === type);
      const suffix = systemic.length > 0 ? " (systemic)" : "";
      return `  - ${count} ${type.replace(/_/g, " ")}${suffix}`;
    })
    .join("\n");

  const part1 = [
    `QA Report — ${browse.dates[0]}${dryRunLabel}`,
    "",
    `Scanned: ${browse.stats.filmsExtracted} films, ${browse.stats.screeningsExtracted} screenings (today + tomorrow)`,
    `Issues found: ${analysis.issuesFound.length}`,
    issueSummaryLines || "  (none)",
  ].join("\n");

  await sendTelegramAlert({ title: "QA Report", message: part1, level: "info" });
  await delay(500);

  // Part 2: Fixes Applied
  const fixLines = analysis.fixesApplied.map((f) => {
    const icon = f.applied ? "✓" : "✗";
    return `  ${icon} ${f.action.replace(/_/g, " ")}: ${f.note}`;
  });

  const systemicAlerts = systemicIssues
    .map((i) => `Systemic: ${i.description}`)
    .slice(0, 3);

  const part2 = [
    `Fixes: ${analysis.stats.fixesApplied}/${analysis.stats.totalIssues}`,
    ...fixLines.slice(0, 15),
    ...(fixLines.length > 15 ? [`  ... and ${fixLines.length - 15} more`] : []),
    ...(systemicAlerts.length > 0 ? ["", ...systemicAlerts] : []),
  ].join("\n");

  const fixLevel = systemicIssues.some((i) => i.severity === "critical") ? "warn" : "info";
  await sendTelegramAlert({ title: "QA Fixes", message: part2, level: fixLevel });
  await delay(500);

  // Part 3: Prevention Recommendations (if generated)
  if (analysis.preventionReport) {
    // Truncate to fit Telegram's 4096 char limit (with room for title + markdown)
    const truncated = analysis.preventionReport.slice(0, 3500);
    await sendTelegramAlert({
      title: "QA Prevention",
      message: truncated,
      level: "info",
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createSystemicGitHubIssues(
  analysis: QaAnalysisOutput,
  dryRun: boolean
): Promise<void> {
  try {
    const systemic = analysis.issuesFound.filter(
      (i: ClassifiedIssue) =>
        i.scope === "systemic" &&
        (i.severity === "critical" || i.severity === "warning")
    );

    if (systemic.length === 0) return;

    // Group by issue type
    const byType = new Map<string, ClassifiedIssue[]>();
    for (const issue of systemic) {
      const existing = byType.get(issue.type) ?? [];
      existing.push(issue);
      byType.set(issue.type, existing);
    }

    for (const [type, issues] of byType) {
      const typeLabel = type.replace(/_/g, " ");
      const title = `QA: ${issues.length} ${typeLabel} detected (systemic)`;

      const tableRows = issues.slice(0, 20).map((i: ClassifiedIssue) => {
        const entity = i.entityId.slice(0, 8);
        return `| ${i.severity} | ${entity} | ${i.description.slice(0, 80)} |`;
      });

      const body = [
        `## Systemic ${typeLabel}`,
        "",
        `The automated QA pipeline detected **${issues.length}** systemic ${typeLabel} issues.`,
        dryRun ? "\n> **DRY RUN** — no fixes were applied.\n" : "",
        "| Severity | Entity | Description |",
        "|----------|--------|-------------|",
        ...tableRows,
        issues.length > 20 ? `\n_...and ${issues.length - 20} more_` : "",
        "",
        analysis.preventionReport
          ? `## Prevention Recommendations\n\n${analysis.preventionReport.slice(0, 2000)}`
          : "",
        "",
        `_Created by QA pipeline at ${new Date().toISOString()}_`,
      ]
        .filter(Boolean)
        .join("\n");

      await createGitHubIssue({
        title,
        body,
        labels: ["qa-automated", "data-quality"],
      });
    }
  } catch (err) {
    // Never crash the pipeline over GitHub issue creation
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[qa] GitHub issue creation failed: ${msg}`);
  }
}
