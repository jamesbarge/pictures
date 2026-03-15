/**
 * AutoQuality Trigger.dev Tasks
 *
 * Two exports following the QA orchestrator pattern:
 *   1. autoQualityRun — Regular task (API-triggerable, 60 min budget)
 *   2. autoQualitySchedule — Cron wrapper (daily 2am UTC)
 *
 * The cron wrapper delegates to autoQualityRun so that both scheduled
 * and on-demand triggers use the same task type.
 *
 * Thresholds persist across runs via the `autoresearch_config` DB table,
 * so each run starts where the previous one left off. Cross-run experiment
 * history is injected into the agent prompt to avoid repeating failures.
 */

import { schedules, task, tasks } from "@trigger.dev/sdk/v3";
import { sendTelegramAlert } from "../utils/telegram";

// ── Regular task: the actual pipeline (API-triggerable) ──────────────
export const autoQualityRun = task({
  id: "autoquality-run",
  maxDuration: 3600, // 60 min
  retry: { maxAttempts: 0 },
  run: async (payload: { triggeredBy?: string }) => {
    console.log(`[autoquality] Starting, triggeredBy=${payload.triggeredBy ?? "manual"}`);

    const { runAutoQualityWeekly } = await import(
      "@/autoresearch/autoquality/harness"
    );
    const { runAuditForDqs } = await import(
      "@/autoresearch/autoquality/audit-wrapper"
    );

    return await runAutoQualityWeekly(runAuditForDqs);
  },
});

// ── Cron wrapper: daily 2am UTC ──────────────────────────────────────
export const autoQualitySchedule = schedules.task({
  id: "autoquality-daily",
  cron: "0 2 * * *", // Daily 2am UTC
  maxDuration: 3600,
  retry: { maxAttempts: 0 },
  run: async () => {
    const handle = await tasks.triggerAndWait<typeof autoQualityRun>(
      "autoquality-run",
      { triggeredBy: "cron" }
    );

    if (!handle.ok) {
      const errMsg =
        handle.error instanceof Error
          ? handle.error.message
          : String(handle.error ?? "unknown");
      await sendTelegramAlert({
        title: "AutoQuality Failed",
        message: errMsg,
        level: "error",
      });
      throw new Error(`AutoQuality failed: ${errMsg}`);
    }

    return handle.output;
  },
});
