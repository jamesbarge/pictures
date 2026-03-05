import { schedules, batch } from "@trigger.dev/sdk/v3";
import { sendTelegramAlert } from "./utils/telegram";

type TaskRef = { id: string };

const CHAIN_TASKS: TaskRef[] = [
  { id: "scraper-chain-curzon" },
  { id: "scraper-chain-picturehouse" },
  { id: "scraper-chain-everyman" },
  { id: "scraper-chain-odeon" },
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
  { id: "enrichment-festival-reverse-tag" },
  { id: "enrichment-bfi-changes" },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
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
    const playwrightChunks = chunk(PLAYWRIGHT_TASKS, 4);
    let pwSucceeded = 0, pwFailed = 0;
    for (const [i, chunkTasks] of playwrightChunks.entries()) {
      const result = await triggerBatch(chunkTasks, `Playwright-${i + 1}`);
      pwSucceeded += result.succeeded;
      pwFailed += result.failed;
    }
    waveSummaries.push({
      label: "Playwright",
      succeeded: pwSucceeded,
      failed: pwFailed,
      total: PLAYWRIGHT_TASKS.length,
    });

    // Wave 3: Cheerio independents (chunked into batches of 6)
    const cheerioChunks = chunk(CHEERIO_TASKS, 6);
    let cheerioSucceeded = 0, cheerioFailed = 0;
    for (const [i, chunkTasks] of cheerioChunks.entries()) {
      const result = await triggerBatch(chunkTasks, `Cheerio-${i + 1}`);
      cheerioSucceeded += result.succeeded;
      cheerioFailed += result.failed;
    }
    waveSummaries.push({
      label: "Cheerio",
      succeeded: cheerioSucceeded,
      failed: cheerioFailed,
      total: CHEERIO_TASKS.length,
    });

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
