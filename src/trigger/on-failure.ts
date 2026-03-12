import { tasks } from "@trigger.dev/sdk/v3";
import { classifyAlert, sendTieredAlert } from "./utils/alert-tiers";

/**
 * Shared onFailure handler for all scraper tasks.
 * Registered as middleware — attaches to every task in the project.
 */
tasks.onFailure(async ({ task, error, ctx }) => {
  const message = error instanceof Error ? error.message : String(error);
  const runId = ctx.run.id;

  console.error(`[trigger.dev:onFailure] ${task} run ${runId} failed: ${message}`);

  // Report to PostHog (best-effort)
  try {
    const { captureServerException } = await import("@/lib/posthog-server");
    captureServerException(
      error instanceof Error ? error : new Error(message),
      undefined,
      {
        trigger_task: task,
        trigger_run_id: runId,
        source: "trigger.dev-failure-handler",
      }
    );
  } catch {
    // PostHog not available — log and continue
  }

  const tier = classifyAlert(task);
  await sendTieredAlert(tier, { taskId: task, runId, error: message });
});
