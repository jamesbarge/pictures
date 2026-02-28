/**
 * AI Verify API
 * Analyzes an anomaly using Claude and returns informational analysis
 *
 * POST /api/admin/anomalies/verify
 *
 * Uses Haiku first for speed, escalates to Sonnet if confidence < 0.7
 */

import { requireAdmin } from "@/lib/auth";
import { generateText, stripCodeFences } from "@/lib/gemini";
import { db } from "@/db";
import { cinemas, screenings } from "@/db/schema";
import { eq, gte, lte, count, and } from "drizzle-orm";
import { endOfDay, subDays, format } from "date-fns";

interface VerifyRequest {
  cinemaId: string;
  anomalyType: "low_count" | "zero_results" | "high_variance";
  todayCount: number;
  lastWeekCount: number;
}

interface VerifyResponse {
  analysis: string;
  confidence: number;
  model: "gemini";
  suggestedAction?: string;
}

export async function POST(request: Request) {
  // Verify admin auth
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const body: VerifyRequest = await request.json();
    const { cinemaId, anomalyType, todayCount, lastWeekCount } = body;

    if (!cinemaId || !anomalyType) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch cinema details
    const cinema = await db
      .select({
        id: cinemas.id,
        name: cinemas.name,
        website: cinemas.website,
        chain: cinemas.chain,
      })
      .from(cinemas)
      .where(eq(cinemas.id, cinemaId))
      .limit(1);

    if (cinema.length === 0) {
      return Response.json({ error: "Cinema not found" }, { status: 404 });
    }

    const cinemaData = cinema[0];

    // Fetch recent screening history (last 7 days)
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);
    const recentCounts = await db
      .select({
        count: count(screenings.id),
      })
      .from(screenings)
      .where(
        and(
          eq(screenings.cinemaId, cinemaId),
          gte(screenings.datetime, sevenDaysAgo),
          lte(screenings.datetime, endOfDay(now))
        )
      );

    const totalRecent = recentCounts[0]?.count || 0;

    // Build context for AI analysis
    const context = `
Cinema: ${cinemaData.name}
Website: ${cinemaData.website || "Unknown"}
Chain: ${cinemaData.chain || "Independent"}
Anomaly Type: ${anomalyType}
Today's Screening Count: ${todayCount}
Last Week Same Day Count: ${lastWeekCount}
Total Screenings (last 7 days): ${totalRecent}
Date: ${format(now, "EEEE, d MMMM yyyy")}
`;

    const result = await analyzeAnomaly(context, anomalyType);

    return Response.json({
      analysis: result.analysis,
      confidence: result.confidence,
      model: "gemini",
      suggestedAction: result.suggestedAction,
    } as VerifyResponse);
  } catch (error) {
    console.error("Error in AI verify:", error);
    return Response.json(
      { error: "Failed to analyze anomaly" },
      { status: 500 }
    );
  }
}

async function analyzeAnomaly(
  context: string,
  anomalyType: string
): Promise<{ analysis: string; confidence: number; suggestedAction?: string }> {
  const systemPrompt = `You are a cinema data quality analyst. Analyze screening data anomalies and provide concise, actionable insights.

Your response must be a JSON object with this exact structure:
{
  "analysis": "2-3 sentence explanation of what might be causing this anomaly",
  "confidence": 0.0-1.0 (how confident you are in your analysis),
  "suggestedAction": "Optional suggestion for what the admin should do"
}

Common causes of anomalies:
- Website changes breaking scrapers
- Cinema closed for renovation/holiday
- Special events replacing regular screenings
- Scraper timing issues (site not updated yet)
- Technical issues on cinema's booking system`;

  const userPrompt = `Analyze this cinema screening anomaly:

${context}

Anomaly type "${anomalyType}" means:
- zero_results: No screenings found today, but there were screenings last week
- low_count: Significantly fewer screenings than expected
- high_variance: Unusually high count, possible duplicates

Provide your analysis as JSON.`;

  const text = await generateText(userPrompt, { systemPrompt });

  // Parse JSON response
  try {
    const parsed = JSON.parse(stripCodeFences(text));
    return {
      analysis: parsed.analysis || "Unable to analyze",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      suggestedAction: parsed.suggestedAction,
    };
  } catch {
    // If JSON parsing fails, return the raw text
    return {
      analysis: text.slice(0, 500),
      confidence: 0.5,
    };
  }
}
