/**
 * Link Validator Agent API
 * Runs link verification on a sample of upcoming screenings
 *
 * POST /api/admin/agents/links
 */

import { withAdminAuth } from "@/lib/auth";
import { geminiKeyMissingResponse, agentErrorResponse } from "../shared";

export const maxDuration = 30;

export const POST = withAdminAuth(async () => {
  if (!process.env.GEMINI_API_KEY) {
    return geminiKeyMissingResponse();
  }

  try {
    // Dynamic import to avoid loading SDK if API key missing
    const { verifySampleOfUpcomingLinks } = await import("@/agents");

    // Run link validator with smaller sample for dashboard (faster)
    const result = await verifySampleOfUpcomingLinks(20);

    if (!result.success) {
      return Response.json({
        success: false,
        summary: "Link verification failed",
        error: result.error,
      });
    }

    const links = result.data || [];
    const verified = links.filter((l) => l.status === "verified").length;
    const broken = links.filter((l) => l.status === "broken").length;
    const redirect = links.filter((l) => l.status === "redirect").length;

    const details: string[] = [];

    // Add broken links to details
    for (const link of links.filter((l) => l.status === "broken")) {
      details.push(`Broken: ${link.url?.slice(0, 60)}...`);
    }

    // Add redirects to details
    for (const link of links.filter((l) => l.status === "redirect")) {
      details.push(`Redirect: ${link.url?.slice(0, 60)}...`);
    }

    return Response.json({
      success: true,
      summary: `Verified ${links.length} links: ${verified} valid, ${broken} broken, ${redirect} redirects`,
      details: details.length > 0 ? details : undefined,
      tokensUsed: result.tokensUsed,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error) {
    return agentErrorResponse("Link validator", "Link verification", error);
  }
});
