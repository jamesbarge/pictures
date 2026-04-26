import { schedules, batch } from "@trigger.dev/sdk/v3";
import { gte, eq } from "drizzle-orm";
import { db } from "@/db";
import { scraperRuns } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { sendTelegramAlert } from "./utils/telegram";

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
        reason: (r.anomalyDetails as { errorMessage?: string } | null)?.errorMessage ?? "unknown",
      });
    } else if (r.status === "success" && (r.screeningCount ?? 0) === 0) {
      zeroCounts.push({ name: r.cinemaName });
    }
  }

  return { anomalies, failures, zeroCounts };
}

type TaskRef = { id: string };

const CHAIN_TASKS: TaskRef[] = [
  { id: "scraper-chain-curzon" },
  { id: "scraper-chain-picturehouse" },
  { id: "scraper-chain-everyman" },

];

const PLAYWRIGHT_TASKS: TaskRef[] = [
  { id: "scraper-bfi" },
  { id: "scraper-barbican" },
  { id: "scraper-phoenix" },
  { id: "scraper-electric" },
  { id: "scraper-lexi" },
  { id: "scraper-regent-street" },
  { id: "scraper-rich-mix" },
];

const CHEERIO_TASKS: TaskRef[] = [
  { id: "scraper-castle" },
  { id: "scraper-rio" },
  { id: "scraper-prince-charles" },
  { id: "scraper-ica" },
  { id: "scraper-genesis" },
  { id: "scraper-peckhamplex" },
  { id: "scraper-nickel" },
  { id: "scraper-garden" },
  { id: "scraper-close-up" },
  { id: "scraper-cine-lumiere" },
  { id: "scraper-castle-sidcup" },
  { id: "scraper-arthouse" },
  { id: "scraper-coldharbour-blue" },
  { id: "scraper-olympic" },
  { id: "scraper-david-lean" },
  { id: "scraper-riverside" },
];

const ENRICHMENT_TASKS: TaskRef[] = [
  { id: "enrichment-letterboxd" },
];

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function triggerBatch(taskRefs: TaskRef[], label: string) {
  const payload = { triggeredBy: "scrape-all-orchestrator" };

  const results = await batch.triggerAndWait(
    taskRefs.map((t) => ({ id: t.id, payload }))
  );

  let succeeded = 0;
  let failed = 0;
  for (const run of results.runs) {
    if (run.ok) {
      succeeded++;
    } else {
      failed++;
      console.log(
        `[scrape-all] ${label} FAILED: ${run.taskIdentifier} — ${
          run.error instanceof Error ? run.error.message : String(run.error ?? "unknown")
        }`
      );
    }
  }

  console.log(`[scrape-all] ${label}: ${succeeded} succeeded, ${failed} failed`);
  return { label, succeeded, failed, total: taskRefs.length };
}


/** Trigger tasks in size-limited chunks and aggregate results. */
async function triggerChunkedBatch(tasks: TaskRef[], chunkSize: number, label: string) {
  const chunks = chunk(tasks, chunkSize);
  let succeeded = 0, failed = 0;
  for (const [i, chunkTasks] of chunks.entries()) {
    const result = await triggerBatch(chunkTasks, `${label}-${i + 1}`);
    succeeded += result.succeeded;
    failed += result.failed;
  }
  return { label, succeeded, failed, total: tasks.length };
}

export const scrapeAll = schedules.task({
  id: "scrape-all-orchestrator",
  cron: "0 3 * * *", // Daily 3am UTC
  maxDuration: 5400, // 90 min — sequential waves + chunking overhead
  retry: { maxAttempts: 0 },
  run: async () => {
    const startTime = Date.now();
    const startedAt = new Date(startTime);
    const waveSummaries: { label: string; succeeded: number; failed: number; total: number }[] = [];

    // Wave 1: Chain scrapers (4 concurrent)
    waveSummaries.push(await triggerBatch(CHAIN_TASKS, "Chains"));

    // Wave 2: Playwright independents (chunked into batches of 4)
    waveSummaries.push(await triggerChunkedBatch(PLAYWRIGHT_TASKS, 4, "Playwright"));

    // Wave 3: Cheerio independents (chunked into batches of 6)
    waveSummaries.push(await triggerChunkedBatch(CHEERIO_TASKS, 6, "Cheerio"));

    // Wave 4: Post-scrape enrichment
    waveSummaries.push(await triggerBatch(ENRICHMENT_TASKS, "Enrichment"));

    const totalSucceeded = waveSummaries.reduce((s, w) => s + w.succeeded, 0);
    const totalFailed = waveSummaries.reduce((s, w) => s + w.failed, 0);
    const durationMin = Math.round((Date.now() - startTime) / 60_000);

    const summaryLines = waveSummaries.map(
      (w) => `${w.label}: ${w.succeeded}/${w.total} OK${w.failed > 0 ? ` (${w.failed} failed)` : ""}`
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
            .join("\n")
      );
    }
    if (anomalyReport.failures.length > 0) {
      messageParts.push(
        `\nFailures (${anomalyReport.failures.length}):\n` +
          anomalyReport.failures.map((f) => `• ${f.name}: ${f.reason}`).join("\n")
      );
    }
    if (anomalyReport.zeroCounts.length > 0) {
      messageParts.push(
        `\nZero-count (no baseline) (${anomalyReport.zeroCounts.length}):\n` +
          anomalyReport.zeroCounts.map((z) => `• ${z.name}`).join("\n")
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
  },
});
