/**
 * Enrichment Agent API
 * Runs TMDB enrichment on unmatched films
 *
 * POST /api/admin/agents/enrich
 *
 * Note: This runs with enableAutoFix from config, so matches above
 * confidence threshold will be applied. The dashboard shows results only.
 */

import { withAdminAuth } from "@/lib/auth";
import { geminiKeyMissingResponse, agentErrorResponse } from "../shared";

export const maxDuration = 60;

export const POST = withAdminAuth(async () => {
  if (!process.env.GEMINI_API_KEY) {
    return geminiKeyMissingResponse();
  }

  try {
    // Dynamic import to avoid loading SDK if API key missing
    const { enrichUnmatchedFilms } = await import("@/agents");

    // Run enrichment with smaller batch for dashboard (faster)
    const result = await enrichUnmatchedFilms(10);

    if (!result.success) {
      return Response.json({
        success: false,
        summary: "Enrichment failed",
        error: result.error,
      });
    }

    const matches = result.data || [];
    const autoApplied = matches.filter((m) => m.shouldAutoApply).length;
    const needsReview = matches.filter((m) => !m.shouldAutoApply).length;

    const details: string[] = [];

    // Add matches to details
    for (const match of matches.slice(0, 10)) {
      const status = match.shouldAutoApply ? "✓" : "?";
      details.push(
        `${status} "${match.originalTitle}" → "${match.matchedTitle}" (${(match.confidence * 100).toFixed(0)}%)`
      );
    }

    return Response.json({
      success: true,
      summary: `Found ${matches.length} matches: ${autoApplied} auto-applied, ${needsReview} need review`,
      details: details.length > 0 ? details : undefined,
      tokensUsed: result.tokensUsed,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error) {
    return agentErrorResponse("Enrichment", "Enrichment", error);
  }
});
