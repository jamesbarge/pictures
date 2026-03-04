import { schedules, tasks } from "@trigger.dev/sdk/v3";
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

async function triggerBatch(taskRefs: TaskRef[], label: string) {
  const payload = { triggeredBy: "scrape-all-orchestrator" };

  // Trigger all tasks in parallel, wait for each to complete
  const results = await Promise.allSettled(
    taskRefs.map((t) => tasks.triggerAndWait(t.id, payload))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`[scrape-all] ${label}: ${succeeded} succeeded, ${failed} failed`);
  return { label, succeeded, failed, total: taskRefs.length };
}

export const scrapeAll = schedules.task({
  id: "scrape-all-orchestrator",
  cron: "0 3 * * *", // 3am UTC daily
  maxDuration: 3600, // 60 min — waits for all 3 waves sequentially
  retry: { maxAttempts: 0 },
  run: async () => {
    const startTime = Date.now();
    const waveSummaries: { label: string; succeeded: number; failed: number; total: number }[] = [];

    // Wave 1: Chain scrapers (4 concurrent)
    waveSummaries.push(await triggerBatch(CHAIN_TASKS, "Chains"));

    // Wave 2: Playwright independents (all concurrent)
    waveSummaries.push(await triggerBatch(PLAYWRIGHT_TASKS, "Playwright"));

    // Wave 3: Cheerio independents (all concurrent)
    waveSummaries.push(await triggerBatch(CHEERIO_TASKS, "Cheerio"));

    const totalSucceeded = waveSummaries.reduce((s, w) => s + w.succeeded, 0);
    const totalFailed = waveSummaries.reduce((s, w) => s + w.failed, 0);
    const durationMin = Math.round((Date.now() - startTime) / 60_000);

    const summaryLines = waveSummaries.map(
      (w) => `${w.label}: ${w.succeeded}/${w.total} OK${w.failed > 0 ? ` (${w.failed} failed)` : ""}`
    );

    await sendTelegramAlert({
      title: "Daily Scrape Complete",
      message: `Duration: ${durationMin}min\n${summaryLines.join("\n")}\n\nTotal: ${totalSucceeded} succeeded, ${totalFailed} failed`,
      level: totalFailed > 0 ? "warn" : "info",
    });

    return { durationMin, totalSucceeded, totalFailed, waves: waveSummaries };
  },
});
