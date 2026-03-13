/**
 * Shared utilities for admin agent API routes.
 * Deduplicates the GEMINI_API_KEY guard and error response pattern.
 */

/** Returns a 200 JSON response indicating the GEMINI_API_KEY is not configured. */
export function geminiKeyMissingResponse() {
  return Response.json({
    success: false,
    summary: "Agent not configured",
    error:
      "GEMINI_API_KEY environment variable is not set. Add it in Vercel project settings.",
  });
}

/** Returns a 500 JSON error response for agent route catch blocks. */
export function agentErrorResponse(
  logPrefix: string,
  summaryLabel: string,
  error: unknown
) {
  console.error(`${logPrefix} error:`, error);
  return Response.json(
    {
      success: false,
      summary: `${summaryLabel} failed`,
      error: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 }
  );
}
