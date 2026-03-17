import { sendTelegramAlert } from "./telegram";

/** Severity tier for operational alerts: P1 (critical), P2 (daily digest), P3 (weekly) */
export type AlertTier = "P1" | "P2" | "P3";

/** Context passed to the alert system when a task fails */
interface AlertContext {
  taskId: string;
  runId: string;
  error: string;
}

/**
 * Classify an alert by severity tier:
 * - P1: Orchestrator failure, chain-wide failure (immediate Telegram)
 * - P2: Individual scraper/enrichment failure (daily digest — logged for now)
 * - P3: Partial failure, warnings (weekly summary — logged for now)
 */
export function classifyAlert(taskId: string): AlertTier {
  // P1: Orchestrator failures are always critical
  if (taskId === "scrape-all-orchestrator" || taskId === "qa-orchestrator") return "P1";

  // P1: Chain-wide failures affect many venues
  if (taskId.startsWith("scraper-chain-")) return "P1";

  // P2: Individual scraper, enrichment, or QA sub-task failures
  if (taskId.startsWith("scraper-") || taskId.startsWith("enrichment-") || taskId.startsWith("qa-")) return "P2";

  // P3: Everything else (partial failures, warnings)
  return "P3";
}

/**
 * Send an alert based on its tier.
 * - P1: Immediate Telegram notification
 * - P2/P3: Logged (digest infrastructure is a future enhancement)
 */
export async function sendTieredAlert(tier: AlertTier, context: AlertContext): Promise<void> {
  const shortError = context.error.slice(0, 500);

  if (tier === "P1") {
    await sendTelegramAlert({
      title: `[P1] Task Failed: ${context.taskId}`,
      message: `Run: ${context.runId}\nError: ${shortError}`,
      level: "error",
    });
    return;
  }

  if (tier === "P2") {
    // P2: Log for daily digest (Telegram digest is a future enhancement)
    console.warn(`[alert:P2] ${context.taskId} run ${context.runId}: ${shortError}`);
    await sendTelegramAlert({
      title: `[P2] Task Failed: ${context.taskId}`,
      message: `Run: ${context.runId}\nError: ${shortError}`,
      level: "warn",
    });
    return;
  }

  // P3: Log only
  console.info(`[alert:P3] ${context.taskId} run ${context.runId}: ${shortError}`);
}
