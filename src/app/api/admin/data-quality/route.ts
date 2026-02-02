/**
 * Data Quality API
 * Returns film data quality audit results for the admin dashboard
 *
 * GET /api/admin/data-quality
 * POST /api/admin/data-quality  (trigger fallback enrichment)
 */

import { auth } from "@clerk/nextjs/server";
import { auditFilmData } from "@/scripts/audit-film-data";
import { NextRequest } from "next/server";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upcomingOnly = request.nextUrl.searchParams.get("upcomingOnly") === "true";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 200;

  try {
    const result = await auditFilmData(upcomingOnly, limit);
    return Response.json(result);
  } catch (error) {
    console.error("Data quality audit error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Audit failed" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      success: false,
      summary: "Agent not configured",
      error: "ANTHROPIC_API_KEY environment variable is not set.",
    });
  }

  try {
    const { runFallbackEnrichment } = await import(
      "@/agents/fallback-enrichment"
    );

    const result = await runFallbackEnrichment({ limit: 10 });

    return Response.json({
      success: result.success,
      summary: result.success
        ? `Processed ${result.data?.processed ?? 0} films: ${result.data?.autoApplied ?? 0} auto-applied, ${result.data?.needsReview ?? 0} need review`
        : "Fallback enrichment failed",
      details: result.data?.details,
      tokensUsed: result.tokensUsed,
      executionTimeMs: result.executionTimeMs,
      error: result.error,
    });
  } catch (error) {
    console.error("Fallback enrichment error:", error);
    return Response.json(
      {
        success: false,
        summary: "Fallback enrichment failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
