/**
 * Scrape-All Orchestrator — pure-Node job module.
 *
 * Extracted out of src/trigger/scrape-all.ts so the same logic runs locally
 * (Bree scheduler, CLI, admin API) without any the cloud orchestrator dependency. The
 * trigger wrapper is now a thin shim that calls runScrapeAll().
 *
 * Fans out scrapers in 4 waves using the in-process registry:
 *   1. Chains  (3 scrapers, parallel)
 *   2. Playwright independents (7 scrapers, parallel cap 4)
 *   3. Cheerio / API independents (16 scrapers, parallel cap 4)
 *   4. Enrichment — Letterboxd ratings + post-scrape enrichment hooks
 *
 * Replaces the cloud orchestrator's `batch.triggerAndWait` with a local Promise.all-based
 * fan-out, capped at concurrency=4 per wave to avoid overwhelming the host.
 * Logs anomaly/failure/zero-count signals via summariseRunsSince and
 * dispatches a Telegram digest at the end (same shape as before).
 */

import { gte, eq } from "drizzle-orm";
import { db } from "@/db";
import { scraperRuns } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { sendTelegramAlert } from "@/lib/telegram";
import { runScraper } from "@/scrapers/runner-factory";
import {
  SCRAPER_REGISTRY,
  type ScraperRegistryEntry,
  type ScraperWave,
} from "@/scrapers/registry";

interface AnomalySummary {
  anomalies: { name: string; type: string; count: number; baseline: number | null }[];
  failures: { name: string; reason: string }[];
  zeroCounts: { name: string }[];
}

/**
 * Inspect runs from this orchestration window for anomalies, failures, and
 * zero-count returns. Zero-count without a baseline still warrants attention —
 * 66/67 cinemas had no baseline as of the 2026-04-26 audit, so anomaly
 * detection silently passed every run unless we add this fallback.
 */
async function summariseRunsSince(since: Date): Promise<AnomalySummary> {
  const runs = await db
    .select({
      cinemaName: cinemas.name,
      status: scraperRuns.status,
      anomalyType: scraperRuns.anomalyType,
      screeningCount: scraperRuns.screeningCount,
      baselineCount: scraperRuns.baselineCount,
      anomalyDetails: scraperRuns.anomalyDetails,
    })
    .from(scraperRuns)
    .innerJoin(cinemas, eq(scraperRuns.cinemaId, cinemas.id))
    .where(gte(scraperRuns.startedAt, since));

  const anomalies: AnomalySummary["anomalies"] = [];
  const failures: AnomalySummary["failures"] = [];
  const zeroCounts: AnomalySummary["zeroCounts"] = [];

  for (const r of runs) {
    if (r.status === "anomaly") {
      anomalies.push({
        name: r.cinemaName,
        type: r.anomalyType ?? "unknown",
        count: r.screeningCount ?? 0,
        baseline: r.baselineCount,
      });
    } else if (r.status === "failed") {
      failures.push({
        name: r.cinemaName,
        reason:
          (r.anomalyDetails as { errorMessage?: string } | null)?.errorMessage ?? "unknown",
      });
    } else if (r.status === "success" && (r.screeningCount ?? 0) === 0) {
      zeroCounts.push({ name: r.cinemaName });
    }
  }

  return { anomalies, failures, zeroCounts };
}

interface WaveSummary {
  label: string;
  succeeded: number;
  failed: number;
  total: number;
}

/**
 * Run an array of async tasks with a concurrency cap. Resolves once all
 * tasks settle — never rejects (errors are surfaced via task return values).
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Run a single scraper-registry entry and return wave-summary contribution. */
async function runScraperEntry(
  entry: ScraperRegistryEntry,
): Promise<{ succeeded: boolean; error?: string }> {
  try {
    const config = entry.buildConfig();
    const result = await runScraper(config, { useValidation: true });
    return { succeeded: result.success };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[scrape-all] ${entry.taskId} threw: ${message}`);
    return { succeeded: false, error: message };
  }
}

/** Fan-out scrapers in a single wave with the given concurrency cap. */
async function runWave(
  wave: ScraperWave,
  label: string,
  concurrency: number,
): Promise<WaveSummary> {
  const entries = SCRAPER_REGISTRY.filter((e) => e.wave === wave);
  const tasks = entries.map((entry) => () => runScraperEntry(entry));
  const settled = await runWithConcurrency(tasks, concurrency);

  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const taskId = entries[i].taskId;
    if (result.status === "fulfilled" && result.value.succeeded) {
      succeeded++;
    } else {
      failed++;
      const reason =
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : (result.value.error ?? "scraper returned success=false");
      console.log(`[scrape-all] ${label} FAILED: ${taskId} — ${reason}`);
    }
  }

  console.log(`[scrape-all] ${label}: ${succeeded} succeeded, ${failed} failed`);
  return { label, succeeded, failed, total: entries.length };
}

/** Run the enrichment wave: Letterboxd ratings + (best-effort) other tasks. */
async function runEnrichmentWave(): Promise<WaveSummary> {
  let succeeded = 0;
  let failed = 0;
  const total = 1; // enrichment-letterboxd

  try {
    const { enrichLetterboxdRatings } = await import("@/db/enrich-letterboxd");
    await enrichLetterboxdRatings(100, true);
    succeeded++;
  } catch (err) {
    failed++;
    console.log(
      `[scrape-all] Enrichment FAILED: enrichment-letterboxd — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  console.log(`[scrape-all] Enrichment: ${succeeded} succeeded, ${failed} failed`);
  return { label: "Enrichment", succeeded, failed, total };
}

export interface ScrapeAllResult {
  durationMin: number;
  totalSucceeded: number;
  totalFailed: number;
  waves: WaveSummary[];
  anomalies: number;
  failures: number;
  zeroCounts: number;
}

/**
 * Pure-Node entry point for the daily scrape orchestrator.
 *
 * Runs the four waves sequentially (each wave parallelises internally up to
 * the concurrency cap), then records a Telegram digest covering anomalies,
 * failures, and zero-count baselines for the run window.
 */
export async function runScrapeAll(): Promise<ScrapeAllResult> {
  const startTime = Date.now();
  const startedAt = new Date(startTime);
  const waveSummaries: WaveSummary[] = [];

  // Wave 1: Chain scrapers (3 — fully parallel)
  waveSummaries.push(await runWave("chain", "Chains", 4));

  // Wave 2: Playwright independents (7 — cap at 4 for memory headroom)
  waveSummaries.push(await runWave("playwright", "Playwright", 4));

  // Wave 3: Cheerio / API independents (16 — cap at 4 to mirror prior chunking)
  waveSummaries.push(await runWave("cheerio", "Cheerio", 4));

  // Wave 4: Post-scrape enrichment (Letterboxd ratings)
  waveSummaries.push(await runEnrichmentWave());

  const totalSucceeded = waveSummaries.reduce((s, w) => s + w.succeeded, 0);
  const totalFailed = waveSummaries.reduce((s, w) => s + w.failed, 0);
  const durationMin = Math.round((Date.now() - startTime) / 60_000);

  const summaryLines = waveSummaries.map(
    (w) => `${w.label}: ${w.succeeded}/${w.total} OK${w.failed > 0 ? ` (${w.failed} failed)` : ""}`,
  );

  // Pull anomaly/failure/zero-count signal from this run window
  const anomalyReport = await summariseRunsSince(startedAt).catch((err) => {
    console.warn("[scrape-all] summariseRunsSince failed:", err);
    return { anomalies: [], failures: [], zeroCounts: [] } as AnomalySummary;
  });

  const totalSignals =
    anomalyReport.anomalies.length +
    anomalyReport.failures.length +
    anomalyReport.zeroCounts.length;

  const messageParts = [
    `Duration: ${durationMin}min`,
    summaryLines.join("\n"),
    `Total: ${totalSucceeded} succeeded, ${totalFailed} failed`,
  ];

  if (anomalyReport.anomalies.length > 0) {
    messageParts.push(
      `\nAnomalies (${anomalyReport.anomalies.length}):\n` +
        anomalyReport.anomalies
          .map((a) => `• ${a.name}: ${a.type} (${a.count} vs baseline ${a.baseline ?? "?"})`)
          .join("\n"),
    );
  }
  if (anomalyReport.failures.length > 0) {
    messageParts.push(
      `\nFailures (${anomalyReport.failures.length}):\n` +
        anomalyReport.failures.map((f) => `• ${f.name}: ${f.reason}`).join("\n"),
    );
  }
  if (anomalyReport.zeroCounts.length > 0) {
    messageParts.push(
      `\nZero-count (no baseline) (${anomalyReport.zeroCounts.length}):\n` +
        anomalyReport.zeroCounts.map((z) => `• ${z.name}`).join("\n"),
    );
  }

  const level: "info" | "warn" | "error" =
    totalFailed > 0 || anomalyReport.failures.length > 0
      ? "error"
      : totalSignals > 0
        ? "warn"
        : "info";

  await sendTelegramAlert({
    title: "Daily Scrape Complete",
    message: messageParts.join("\n"),
    level,
  });

  return {
    durationMin,
    totalSucceeded,
    totalFailed,
    waves: waveSummaries,
    anomalies: anomalyReport.anomalies.length,
    failures: anomalyReport.failures.length,
    zeroCounts: anomalyReport.zeroCounts.length,
  };
}
