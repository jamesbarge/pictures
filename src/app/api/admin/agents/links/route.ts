/**
 * Link Validator Agent API
 * Runs link verification on a sample of upcoming screenings
 *
 * POST /api/admin/agents/links
 */

import { requireAdmin } from "@/lib/auth";

export const maxDuration = 30;

export async function POST() {
  // Verify admin auth
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  // Check for API key before importing agent
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      success: false,
      summary: "Agent not configured",
      error: "ANTHROPIC_API_KEY environment variable is not set. Add it in Vercel project settings.",
    });
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
    console.error("Link validator error:", error);
    return Response.json(
      {
        success: false,
        summary: "Link verification failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
