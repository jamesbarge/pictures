/**
 * QA Orchestrator — Daily QA Pipeline Coordinator
 *
 * Runs daily at 6am UTC. Coordinates:
 *   1. qa-browse (Playwright extraction)
 *   2. qa-analyze-and-fix (DB comparison + Gemini + auto-fix)
 *   3. Telegram summary report
 */

import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { sendTelegramAlert } from "../utils/telegram";
import type { QaBrowseOutput, QaAnalysisOutput, QaOrchestratorOutput } from "./types";

export const qaOrchestrator = schedules.task({
  id: "qa-orchestrator",
  cron: "0 6 * * *", // Daily 6am UTC (7am BST)
  maxDuration: 3600, // 60 min budget
  retry: { maxAttempts: 0 },
  run: async (payload): Promise<QaOrchestratorOutput> => {
    const externalPayload = payload.externalId
      ? undefined
      : (payload as unknown as { dryRun?: boolean; triggeredBy?: string });
    const dryRun = externalPayload?.dryRun ?? true; // Default true for safety

    // Monday overlap guard: scrape-all runs at 3am UTC on Mondays
    const now = new Date();
    if (now.getUTCDay() === 1 && now.getUTCHours() < 5) {
      console.log("[qa] Skipping — Monday early morning, scrape-all may be running");
      return { skipped: true, reason: "monday_overlap_guard" };
    }

    console.log(`[qa] Starting QA pipeline, dryRun=${dryRun}`);

    // ── Step 1: Browse ─────────────────────────────────────────────
    let browseOutput: QaBrowseOutput;
    try {
      const browseHandle = await tasks.triggerAndWait<typeof import("./browse").qaBrowse>(
        "qa-browse",
        { dryRun }
      );
      if (!browseHandle.ok) {
        const errMsg = browseHandle.error instanceof Error
          ? browseHandle.error.message
          : String(browseHandle.error ?? "unknown");
        console.error(`[qa] Browse task failed: ${errMsg}`);
        await sendTelegramAlert({
          title: "QA Pipeline Failed",
          message: `Browse task failed: ${errMsg}`,
          level: "error",
        });
        throw new Error(`Browse failed: ${errMsg}`);
      }
      browseOutput = browseHandle.output;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Browse failed:")) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendTelegramAlert({
        title: "QA Pipeline Failed",
        message: `Browse task error: ${errMsg}`,
        level: "error",
      });
      throw err;
    }

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
    let analysisOutput: QaAnalysisOutput;
    try {
      const analyzeHandle = await tasks.triggerAndWait<typeof import("./analyze-and-fix").qaAnalyzeAndFix>(
        "qa-analyze-and-fix",
        { browseOutput, dryRun }
      );
      if (!analyzeHandle.ok) {
        const errMsg = analyzeHandle.error instanceof Error
          ? analyzeHandle.error.message
          : String(analyzeHandle.error ?? "unknown");
        console.error(`[qa] Analyze task failed: ${errMsg}`);
        await sendTelegramAlert({
          title: "QA Analysis Failed",
          message: `Analyze task failed after successful browse.\nBrowse found ${browseOutput.films.length} films.\nError: ${errMsg}`,
          level: "error",
        });
        throw new Error(`Analyze failed: ${errMsg}`);
      }
      analysisOutput = analyzeHandle.output;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Analyze failed:")) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      await sendTelegramAlert({
        title: "QA Analysis Failed",
        message: `Analyze task error: ${errMsg}`,
        level: "error",
      });
      throw err;
    }

    // ── Step 3: Telegram Report ────────────────────────────────────
    await sendQaReport(browseOutput, analysisOutput, dryRun);

    return {
      browseStats: browseOutput.stats,
      analysisStats: analysisOutput.stats,
      issueCount: analysisOutput.stats.totalIssues,
      fixCount: analysisOutput.stats.fixesApplied,
    };
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
