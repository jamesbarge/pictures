/**
 * Admin Analytics API
 * Queries PostHog data for the analytics dashboard
 *
 * GET /api/admin/analytics?type=summary|recordings|events|funnel
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  healthCheck,
  getDashboardSummary,
  listSessionRecordings,
  getEventDefinitions,
  getConversionFunnel,
  getFilmEngagement,
  getCinemaEngagement,
} from "@/lib/posthog-api";

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    const admin = await requireAdmin();
    if (admin instanceof Response) {
      return admin;
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "summary";
    const dateFrom = searchParams.get("dateFrom") || "-7d";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // First check if PostHog API is configured
    const health = await healthCheck();
    if (!health.connected) {
      return NextResponse.json(
        {
          error: "PostHog API not configured",
          details: health.error,
          setup: {
            required: [
              "POSTHOG_PERSONAL_API_KEY - Generate from PostHog → Settings → Personal API Keys",
              "POSTHOG_PROJECT_ID - Find in PostHog → Project Settings → Project ID",
            ],
          },
        },
        { status: 503 }
      );
    }

    switch (type) {
      case "health":
        return NextResponse.json(health);

      case "summary":
        const summary = await getDashboardSummary(dateFrom);
        return NextResponse.json(summary);

      case "recordings":
        const recordings = await listSessionRecordings({
          limit,
          date_from: dateFrom,
        });
        return NextResponse.json(recordings);

      case "events":
        const events = await getEventDefinitions();
        return NextResponse.json(events);

      case "funnel":
        const funnel = await getConversionFunnel(dateFrom);
        return NextResponse.json(funnel);

      case "films":
        const filmEngagement = await getFilmEngagement(dateFrom);
        return NextResponse.json(filmEngagement);

      case "cinemas":
        const cinemaEngagement = await getCinemaEngagement(dateFrom);
        return NextResponse.json(cinemaEngagement);

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Analytics API Error]", error);

    if (error instanceof Error && error.message.includes("not set")) {
      return NextResponse.json(
        {
          error: "PostHog API not configured",
          details: error.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
