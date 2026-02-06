/**
 * Admin BFI Import API
 * Triggers a BFI PDF import manually
 * POST /api/admin/bfi-import
 *
 * Query params:
 * - changesOnly=true: Only import programme changes (faster)
 */

import { requireAuth, unauthorizedResponse } from "@/lib/auth";

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const changesOnly = url.searchParams.get("changesOnly") === "true";

  try {
    if (changesOnly) {
      // Import only programme changes (faster, daily use)
      const { runProgrammeChangesImport } = await import("@/scrapers/bfi-pdf");
      const result = await runProgrammeChangesImport();

      return Response.json({
        success: result.success,
        type: "changes-only",
        screenings: result.changesScreenings,
        saved: result.savedScreenings,
        lastUpdated: result.changesInfo?.lastUpdated,
        durationMs: result.durationMs,
        errors: result.errors,
        triggeredBy: userId,
      });
    } else {
      // Full PDF import (slower, weekly use)
      const { runBFIImport } = await import("@/scrapers/bfi-pdf");
      const result = await runBFIImport();

      return Response.json({
        success: result.success,
        type: "full-import",
        pdfScreenings: result.pdfScreenings,
        changesScreenings: result.changesScreenings,
        totalScreenings: result.totalScreenings,
        saved: result.savedScreenings,
        durationMs: result.durationMs,
        errors: result.errors,
        triggeredBy: userId,
      });
    }
  } catch (error) {
    console.error("Error running BFI import:", error);
    return Response.json(
      {
        error: "Failed to run BFI import",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check status/info
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  return Response.json({
    endpoints: {
      fullImport: "POST /api/admin/bfi-import",
      changesOnly: "POST /api/admin/bfi-import?changesOnly=true",
    },
    description: "Manually trigger BFI PDF import. Full import parses the monthly guide PDF. Changes-only is faster and just checks the programme changes page.",
    scheduled: {
      fullImport: "Sundays 6:00 AM UTC (via Inngest)",
      changesOnly: "Daily 10:00 AM UTC (via Inngest)",
    },
  });
}
