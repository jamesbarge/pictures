import { schedules, batch } from "@trigger.dev/sdk/v3";
import { sendTelegramAlert } from "./utils/telegram";

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
  { id: "scraper-romford-lumiere" },
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
  cron: "0 3 * * 1", // Weekly Monday 3am UTC
  maxDuration: 5400, // 90 min — sequential waves + chunking overhead
  retry: { maxAttempts: 0 },
  run: async () => {
    const startTime = Date.now();
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

    await sendTelegramAlert({
      title: "Weekly Scrape Complete",
      message: `Duration: ${durationMin}min\n${summaryLines.join("\n")}\n\nTotal: ${totalSucceeded} succeeded, ${totalFailed} failed`,
      level: totalFailed > 0 ? "warn" : "info",
    });

    return { durationMin, totalSucceeded, totalFailed, waves: waveSummaries };
  },
});
