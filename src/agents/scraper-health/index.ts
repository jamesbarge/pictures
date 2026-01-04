/**
 * Scraper Health Monitor Agent
 *
 * This agent monitors scraper output for anomalies:
 * 1. Sudden drops in screening count (possible scraper breakage)
 * 2. Unusual time patterns (all times at odd hours = parsing bug)
 * 3. Missing expected data (no weekends, no evenings, etc.)
 *
 * Uses aggressive auto-fix: automatically blocks bad scrapes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import { eq, gte, and, count, sql } from "drizzle-orm";
import { subDays } from "date-fns";
import {
  type ScraperHealthReport,
  type AgentResult,
  AGENT_CONFIGS,
} from "../types";
import { CINEMA_AGENT_SYSTEM_PROMPT, calculateCost } from "../config";

const AGENT_NAME = "scraper-health";

/**
 * Analyze scraper health for a cinema after scraping
 */
export async function analyzeScraperHealth(
  cinemaId: string,
  newScreeningCount: number,
  screeningSamples?: Array<{
    title: string;
    datetime: Date;
    bookingUrl: string;
  }>
): Promise<AgentResult<ScraperHealthReport>> {
  const startTime = Date.now();
  const config = AGENT_CONFIGS.scraperHealth;

  try {
    // Get cinema info
    const [cinema] = await db
      .select()
      .from(schema.cinemas)
      .where(eq(schema.cinemas.id, cinemaId));

    if (!cinema) {
      throw new Error(`Cinema not found: ${cinemaId}`);
    }

    // Get historical screening counts for last 7 days
    const sevenDaysAgo = subDays(new Date(), 7);
    const historicalData = await db
      .select({
        date: sql<string>`DATE(${schema.screenings.scrapedAt})`,
        count: count(),
      })
      .from(schema.screenings)
      .where(
        and(
          eq(schema.screenings.cinemaId, cinemaId),
          gte(schema.screenings.scrapedAt, sevenDaysAgo)
        )
      )
      .groupBy(sql`DATE(${schema.screenings.scrapedAt})`);

    // Calculate average
    const averageCount =
      historicalData.length > 0
        ? historicalData.reduce((sum, d) => sum + Number(d.count), 0) /
          historicalData.length
        : newScreeningCount; // If no history, use current as baseline

    const percentChange =
      averageCount > 0
        ? ((newScreeningCount - averageCount) / averageCount) * 100
        : 0;

    // Build analysis prompt
    const sampleInfo =
      screeningSamples && screeningSamples.length > 0
        ? `Sample of scraped screenings:
${screeningSamples
  .slice(0, 10)
  .map(
    (s) =>
      `- "${s.title}" at ${s.datetime.toISOString()} - ${s.bookingUrl}`
  )
  .join("\n")}`
        : "No sample data available.";

    const prompt = `Analyze the health of a cinema scraper run.

Cinema: ${cinema.name}
New screening count: ${newScreeningCount}
Average count (last 7 days): ${averageCount.toFixed(1)}
Percent change: ${percentChange.toFixed(1)}%

Historical daily counts: ${historicalData.map((d) => `${d.date}: ${d.count}`).join(", ")}

${sampleInfo}

Analyze for:
1. Is this count suspiciously low? (possible scraper breakage)
2. Do the times look reasonable? (10:00-23:00 is normal)
3. Are the titles/URLs well-formed?
4. Any other red flags?

Respond with JSON:
{
  "anomalyScore": 0-1 (0 = healthy, 1 = definitely broken),
  "anomalyDetected": boolean,
  "shouldBlockScrape": boolean (true if data should NOT be saved),
  "warnings": ["list of specific issues"],
  "recommendation": "brief action recommendation"
}`;

    // Run direct API call
    const client = new Anthropic();
    let tokensUsed = 0;
    let report: ScraperHealthReport = {
      cinemaId,
      cinemaName: cinema.name,
      scrapedAt: new Date(),
      screeningCount: newScreeningCount,
      averageCountLast7Days: averageCount,
      percentChange,
      anomalyScore: 0,
      anomalyDetected: false,
      warnings: [],
      shouldBlockScrape: false,
      recommendation: "",
    };

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 1024,
      system: CINEMA_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    try {
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        report = {
          ...report,
          anomalyScore: parsed.anomalyScore || 0,
          anomalyDetected: parsed.anomalyDetected || false,
          shouldBlockScrape: parsed.shouldBlockScrape || false,
          warnings: parsed.warnings || [],
          recommendation: parsed.recommendation || "",
        };
      }
    } catch (parseError) {
      console.error("Failed to parse agent response:", parseError);
    }

    // Quick heuristic checks that don't need AI
    if (percentChange < -50 && averageCount > 10) {
      report.anomalyDetected = true;
      report.warnings.push(
        `Large drop: ${percentChange.toFixed(1)}% decrease from average`
      );
      if (percentChange < -80) {
        report.shouldBlockScrape = true;
        report.anomalyScore = Math.max(report.anomalyScore, 0.9);
      }
    }

    if (newScreeningCount === 0) {
      report.anomalyDetected = true;
      report.shouldBlockScrape = true;
      report.anomalyScore = 1.0;
      report.warnings.push("Zero screenings scraped - scraper likely broken");
    }

    const cost = calculateCost(
      config.model,
      tokensUsed * 0.7,
      tokensUsed * 0.3
    );

    console.log(
      `[${AGENT_NAME}] ${cinema.name}: anomaly=${report.anomalyDetected}, block=${report.shouldBlockScrape}, cost=$${cost.estimatedCostUsd}`
    );

    return {
      success: true,
      data: report,
      tokensUsed,
      executionTimeMs: Date.now() - startTime,
      agentName: AGENT_NAME,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tokensUsed: 0,
      executionTimeMs: Date.now() - startTime,
      agentName: AGENT_NAME,
      timestamp: new Date(),
    };
  }
}

/**
 * Run health check on all cinemas
 */
export async function runHealthCheckAllCinemas(): Promise<
  AgentResult<ScraperHealthReport[]>
> {
  const startTime = Date.now();
  const reports: ScraperHealthReport[] = [];
  let totalTokens = 0;

  const cinemas = await db.select().from(schema.cinemas);

  for (const cinema of cinemas) {
    // Get recent screening count for this cinema
    const now = new Date();
    const [result] = await db
      .select({ count: count() })
      .from(schema.screenings)
      .where(
        and(
          eq(schema.screenings.cinemaId, cinema.id),
          gte(schema.screenings.datetime, now)
        )
      );

    const screeningCount = Number(result?.count ?? 0);

    const healthResult = await analyzeScraperHealth(cinema.id, screeningCount);

    if (healthResult.success && healthResult.data) {
      reports.push(healthResult.data);
      totalTokens += healthResult.tokensUsed;
    }
  }

  const anomalies = reports.filter((r) => r.anomalyDetected);
  console.log(
    `[${AGENT_NAME}] Checked ${reports.length} cinemas, found ${anomalies.length} anomalies`
  );

  return {
    success: true,
    data: reports,
    tokensUsed: totalTokens,
    executionTimeMs: Date.now() - startTime,
    agentName: AGENT_NAME,
    timestamp: new Date(),
  };
}
