/**
 * Admin QA Trigger API
 * POST /api/admin/qa — Trigger QA pipeline on-demand
 *
 * Body: { dryRun?: boolean } (defaults to true)
 *
 * NOTE: The QA pipeline has not yet been extracted into a pure-Node job
 * module. Until that work lands, this route returns 501 Not Implemented.
 * Run the pipeline manually via `npx tsx scripts/qa-dry-run.ts`.
 */

import { withAdminAuth } from "@/lib/auth";

export const POST = withAdminAuth(async () => {
  return Response.json(
    {
      error: "QA pipeline migration pending",
      message:
        "The QA pipeline has not been migrated to the local job runner yet. " +
        "Run it manually via `npx tsx scripts/qa-dry-run.ts` for now.",
    },
    { status: 501 },
  );
});
