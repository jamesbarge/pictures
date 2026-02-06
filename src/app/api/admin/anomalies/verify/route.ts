/**
 * AI Verify API
 * Analyzes an anomaly using Claude and returns informational analysis
 *
 * POST /api/admin/anomalies/verify
 *
 * Uses Haiku first for speed, escalates to Sonnet if confidence < 0.7
 */

import { requireAdmin } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { cinemas, screenings } from "@/db/schema";
import { eq, gte, lte, count, and } from "drizzle-orm";
import { endOfDay, subDays, format } from "date-fns";

const anthropic = new Anthropic();

interface VerifyRequest {
  cinemaId: string;
  anomalyType: "low_count" | "zero_results" | "high_variance";
  todayCount: number;
  lastWeekCount: number;
}

interface VerifyResponse {
  analysis: string;
  confidence: number;
  model: "haiku" | "sonnet";
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

    // First try with Haiku (fast/cheap)
    const haikuResult = await analyzeWithModel(context, anomalyType, "claude-haiku-4-5-20251101");

    // If confidence is low, escalate to Sonnet
    if (haikuResult.confidence < 0.7) {
      const sonnetResult = await analyzeWithModel(context, anomalyType, "claude-sonnet-4-20250514");
      return Response.json({
        analysis: sonnetResult.analysis,
        confidence: sonnetResult.confidence,
        model: "sonnet",
        suggestedAction: sonnetResult.suggestedAction,
      } as VerifyResponse);
    }

    return Response.json({
      analysis: haikuResult.analysis,
      confidence: haikuResult.confidence,
      model: "haiku",
      suggestedAction: haikuResult.suggestedAction,
    } as VerifyResponse);
  } catch (error) {
    console.error("Error in AI verify:", error);
    return Response.json(
      { error: "Failed to analyze anomaly" },
      { status: 500 }
    );
  }
}

async function analyzeWithModel(
  context: string,
  anomalyType: string,
  model: string
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

  const response = await anthropic.messages.create({
    model,
    max_tokens: 500,
    messages: [
      { role: "user", content: userPrompt },
    ],
    system: systemPrompt,
  });

  // Extract text content
  const textContent = response.content.find(c => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from AI");
  }

  // Parse JSON response
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());
    return {
      analysis: parsed.analysis || "Unable to analyze",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      suggestedAction: parsed.suggestedAction,
    };
  } catch {
    // If JSON parsing fails, return the raw text
    return {
      analysis: textContent.text.slice(0, 500),
      confidence: 0.5,
    };
  }
}
