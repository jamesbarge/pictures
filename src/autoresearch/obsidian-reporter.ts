/**
 * Obsidian Report Writer for AutoResearch
 *
 * Converts OvernightSummary + ExperimentResult[] into structured Obsidian
 * markdown files with YAML frontmatter. Maintains a cursor file for
 * cross-session continuity (same pattern as /kaizen and /data-check).
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { format } from "date-fns";
import type { ExperimentResult, OvernightSummary, TargetSummary } from "./types";

const OBSIDIAN_VAULT = "/Users/jamesbarge/Documents/Obsidian Vault/Pictures";
const AUTORESEARCH_DIR = join(OBSIDIAN_VAULT, "AutoResearch");
const CURSOR_PATH = join(AUTORESEARCH_DIR, "autoresearch-cursor.md");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a full overnight report to the Obsidian vault.
 * Returns the file path written.
 */
export async function writeOvernightReport(
  summary: OvernightSummary,
  experiments: ExperimentResult[]
): Promise<string> {
  await mkdir(AUTORESEARCH_DIR, { recursive: true });

  const ts = format(summary.runStartedAt, "yyyy-MM-dd-HHmm");
  const filename = `${summary.system}-${ts}.md`;
  const filepath = join(AUTORESEARCH_DIR, filename);

  const content = buildReportMarkdown(summary, experiments);
  await writeFile(filepath, content, "utf-8");

  console.log(`[autoresearch] Obsidian report written: ${filepath}`);
  return filepath;
}

/**
 * Update the cursor file with the latest run metadata.
 * Tracks last 20 session log entries.
 */
export async function updateCursor(summary: OvernightSummary): Promise<void> {
  await mkdir(AUTORESEARCH_DIR, { recursive: true });

  const durationMin = Math.round(
    (summary.runCompletedAt.getTime() - summary.runStartedAt.getTime()) / 60_000
  );
  const status = classifyStatus(summary);

  // Load existing cursor to preserve session log
  let totalRuns = 0;
  let sessionLog: SessionLogEntry[] = [];

  try {
    const existing = await readFile(CURSOR_PATH, "utf-8");
    const parsed = parseCursor(existing);
    totalRuns = parsed.totalRuns;
    sessionLog = parsed.sessionLog;
  } catch {
    // First run — no cursor yet
  }

  totalRuns += 1;

  // Add new entry and keep last 20
  sessionLog.push({
    date: format(summary.runStartedAt, "yyyy-MM-dd HH:mm"),
    system: summary.system,
    experiments: summary.totalExperiments,
    kept: summary.experimentsKept,
    status,
    durationMin,
  });
  if (sessionLog.length > 20) {
    sessionLog = sessionLog.slice(-20);
  }

  const cursor = buildCursorMarkdown({
    lastSystem: summary.system,
    lastRun: summary.runStartedAt.toISOString(),
    totalRuns,
    sessionLog,
  });

  await writeFile(CURSOR_PATH, cursor, "utf-8");
  console.log(`[autoresearch] Cursor updated: ${CURSOR_PATH}`);
}

// ---------------------------------------------------------------------------
// Report Builder
// ---------------------------------------------------------------------------

function buildReportMarkdown(
  summary: OvernightSummary,
  experiments: ExperimentResult[]
): string {
  const durationMin = Math.round(
    (summary.runCompletedAt.getTime() - summary.runStartedAt.getTime()) / 60_000
  );
  const status = classifyStatus(summary);
  const systemLabel = summary.system === "autoscrape" ? "AutoScrape" : "AutoQuality";
  const ts = format(summary.runStartedAt, "yyyy-MM-dd HHmm");

  const recovered = summary.targetSummaries.filter((t) => t.recovered);
  const needsAttention = summary.targetSummaries.filter((t) => t.needsManualAttention);

  // Compute net improvement from first experiment and last *kept* experiment
  const netBefore = experiments.length > 0 ? experiments[0].metricBefore : 0;
  const lastKept = experiments.filter((e) => e.kept).pop();
  const netAfter = lastKept?.metricAfter ?? netBefore;

  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push("tags:");
  lines.push("  - autoresearch");
  lines.push(`  - ${summary.system}`);
  lines.push(`status: ${status}`);
  lines.push(`system: ${summary.system}`);
  lines.push(`total_experiments: ${summary.totalExperiments}`);
  lines.push(`kept: ${summary.experimentsKept}`);
  lines.push(`discarded: ${summary.experimentsDiscarded}`);
  lines.push(`duration_minutes: ${durationMin}`);
  lines.push(`run_timestamp: "${summary.runStartedAt.toISOString()}"`);
  lines.push("---");
  lines.push("");

  // Title
  lines.push(`# AutoResearch — ${systemLabel} — ${ts}`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| System | ${systemLabel} |`);
  lines.push(`| Duration | ${durationMin} min |`);
  lines.push(`| Experiments | ${summary.totalExperiments} |`);
  lines.push(`| Kept | ${summary.experimentsKept} |`);
  lines.push(`| Discarded | ${summary.experimentsDiscarded} |`);
  lines.push(`| Net improvement | ${netBefore.toFixed(0)} → ${netAfter.toFixed(0)} |`);
  lines.push("");

  // Recovered section
  lines.push("## Recovered");
  lines.push("");
  if (recovered.length > 0) {
    for (const t of recovered) {
      lines.push(
        `- **${t.targetName}**: ${t.metricBefore.toFixed(0)} → ${t.metricAfter.toFixed(0)} (${t.experimentsRun} experiments)`
      );
    }
  } else {
    lines.push("*No targets recovered this run.*");
  }
  lines.push("");

  // Needs manual attention
  lines.push("## Needs Manual Attention");
  lines.push("");
  if (needsAttention.length > 0) {
    for (const t of needsAttention) {
      lines.push(
        `- **${t.targetName}**: score ${t.metricAfter.toFixed(0)} after ${t.experimentsRun} experiments`
      );
    }
  } else {
    lines.push("*All targets healthy or recovered.*");
  }
  lines.push("");

  // Experiment log table
  lines.push("## Experiment Log");
  lines.push("");
  lines.push("| # | Target | Before | After | Kept | Notes |");
  lines.push("|---|--------|--------|-------|------|-------|");

  experiments.forEach((exp, i) => {
    const target = extractTargetId(exp);
    const notes = exp.notes.length > 80 ? exp.notes.slice(0, 77) + "..." : exp.notes;
    // Escape pipe characters in notes for markdown table
    const safeNotes = notes.replace(/\|/g, "\\|");
    lines.push(
      `| ${i + 1} | ${target} | ${exp.metricBefore.toFixed(0)} | ${exp.metricAfter.toFixed(0)} | ${exp.kept ? "Yes" : "No"} | ${safeNotes} |`
    );
  });
  lines.push("");

  // Suggestion
  lines.push("## Suggestion");
  lines.push("");
  lines.push(buildSuggestion(summary, recovered, needsAttention));
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Cursor Builder
// ---------------------------------------------------------------------------

interface SessionLogEntry {
  date: string;
  system: string;
  experiments: number;
  kept: number;
  status: string;
  durationMin: number;
}

interface CursorData {
  lastSystem: string;
  lastRun: string;
  totalRuns: number;
  sessionLog: SessionLogEntry[];
}

function buildCursorMarkdown(data: CursorData): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`last_system: ${data.lastSystem}`);
  lines.push(`last_run: "${data.lastRun}"`);
  lines.push(`total_runs: ${data.totalRuns}`);
  lines.push("---");
  lines.push("");
  lines.push("# AutoResearch Cursor");
  lines.push("");
  lines.push("## Session Log");
  lines.push("");
  lines.push("| Date | System | Experiments | Kept | Status | Duration |");
  lines.push("|------|--------|-------------|------|--------|----------|");

  for (const entry of data.sessionLog) {
    lines.push(
      `| ${entry.date} | ${entry.system} | ${entry.experiments} | ${entry.kept} | ${entry.status} | ${entry.durationMin}min |`
    );
  }
  lines.push("");

  return lines.join("\n");
}

function parseCursor(content: string): { totalRuns: number; sessionLog: SessionLogEntry[] } {
  let totalRuns = 0;
  const sessionLog: SessionLogEntry[] = [];

  // Extract total_runs from frontmatter
  const totalMatch = content.match(/^total_runs:\s*(\d+)/m);
  if (totalMatch) {
    totalRuns = parseInt(totalMatch[1], 10);
  }

  // Extract session log table rows
  const tableRows = content.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|$/gm);
  if (tableRows) {
    for (const row of tableRows) {
      // Skip header and separator rows
      if (row.includes("Date") || row.includes("---")) continue;
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 6) {
        sessionLog.push({
          date: cells[0],
          system: cells[1],
          experiments: parseInt(cells[2], 10) || 0,
          kept: parseInt(cells[3], 10) || 0,
          status: cells[4],
          durationMin: parseInt(cells[5], 10) || 0,
        });
      }
    }
  }

  return { totalRuns, sessionLog };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyStatus(summary: OvernightSummary): string {
  if (summary.totalExperiments === 0) return "no-experiments";
  const hasRecovered = summary.targetSummaries.some((t) => t.recovered);
  const allHealthy = summary.targetSummaries.every(
    (t) => !t.needsManualAttention
  );
  if (hasRecovered && allHealthy) return "success";
  if (hasRecovered || summary.experimentsKept > 0) return "partial";
  return "no-improvement";
}

function extractTargetId(exp: ExperimentResult): string {
  if (exp.system === "autoscrape") {
    return (exp.configSnapshot as { cinemaId?: string }).cinemaId ?? "unknown";
  }
  if (exp.system === "autoquality") {
    return (exp.configSnapshot as { thresholdKey?: string }).thresholdKey ?? "unknown";
  }
  return "unknown";
}

function buildSuggestion(
  summary: OvernightSummary,
  recovered: TargetSummary[],
  needsAttention: TargetSummary[]
): string {
  if (needsAttention.length > 0) {
    const worst = needsAttention.reduce((a, b) =>
      a.metricAfter < b.metricAfter ? a : b
    );
    return `Priority: manually investigate **${worst.targetName}** (score ${worst.metricAfter.toFixed(0)} after ${worst.experimentsRun} experiments). The automated system could not repair it — likely needs structural changes or manual selector work.`;
  }

  if (recovered.length > 0) {
    const best = recovered.reduce((a, b) =>
      a.metricAfter - a.metricBefore > b.metricAfter - b.metricBefore ? a : b
    );
    return `All targets recovered. Biggest win: **${best.targetName}** (${best.metricBefore.toFixed(0)} → ${best.metricAfter.toFixed(0)}). Consider monitoring for regression over the next 48 hours.`;
  }

  if (summary.totalExperiments === 0) {
    return "All targets healthy — no experiments needed. System is running well.";
  }

  return "No improvements found this run. Consider reviewing the experiment strategy or checking if the underlying data sources have changed.";
}
