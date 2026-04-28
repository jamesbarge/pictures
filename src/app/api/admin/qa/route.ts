/**
 * Admin QA Trigger API
 * POST /api/admin/qa — Trigger QA pipeline on-demand
 *
 * Body: { dryRun?: boolean } (defaults to true)
 *
 * NOTE: The QA pipeline has not yet been extracted from Trigger.dev into a
 * pure-Node job module (Phase 4). Until that work lands, this route returns
 * 501 Not Implemented. Run the pipeline manually via the Trigger.dev
 * dashboard for now.
 */

import { withAdminAuth } from "@/lib/auth";

export const POST = withAdminAuth(async () => {
  return Response.json(
    {
      error: "QA pipeline migration pending",
      message:
        "The QA pipeline has not been migrated to the local job runner yet. " +
        "Run it via the Trigger.dev dashboard until Phase 4 ships.",
    },
    { status: 501 },
  );
});
