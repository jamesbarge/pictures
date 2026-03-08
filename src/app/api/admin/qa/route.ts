/**
 * Admin QA Trigger API
 * POST /api/admin/qa — Trigger QA pipeline on-demand
 *
 * Body: { dryRun?: boolean } (defaults to true)
 */

import { withAdminAuth } from "@/lib/auth";
import { tasks } from "@trigger.dev/sdk/v3";

export const POST = withAdminAuth(async (req, admin) => {
  try {
    let dryRun = true;
    try {
      const body = await req.json();
      if (typeof body.dryRun === "boolean") {
        dryRun = body.dryRun;
      }
    } catch {
      // No body or invalid JSON — use default
    }

    const handle = await tasks.trigger("qa-pipeline", {
      dryRun,
      triggeredBy: admin.userId,
    });

    return Response.json({
      success: true,
      message: `QA pipeline triggered (dryRun=${dryRun})`,
      runId: handle.id,
    });
  } catch (error) {
    console.error("Error triggering QA pipeline:", error);
    return Response.json(
      { error: "Failed to trigger QA pipeline" },
      { status: 500 }
    );
  }
});
