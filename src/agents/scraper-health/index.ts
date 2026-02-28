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

import { generateTextWithUsage } from "@/lib/gemini";
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

    const response = await generateTextWithUsage(prompt, {
      systemPrompt: CINEMA_AGENT_SYSTEM_PROMPT,
    });

    tokensUsed = response.tokensUsed;

    try {
      const responseText = response.text;

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
 * Run health check on all cinemas (batched - single AI call)
 */
export async function runHealthCheckAllCinemas(): Promise<
  AgentResult<ScraperHealthReport[]>
> {
  const startTime = Date.now();
  const config = AGENT_CONFIGS.scraperHealth;

  try {
    const cinemas = await db.select().from(schema.cinemas);
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);

    // Gather all cinema data in parallel
    const cinemaData = await Promise.all(
      cinemas.map(async (cinema) => {
        // Get current screening count
        const [currentResult] = await db
          .select({ count: count() })
          .from(schema.screenings)
          .where(
            and(
              eq(schema.screenings.cinemaId, cinema.id),
              gte(schema.screenings.datetime, now)
            )
          );

        // Get historical counts
        const historicalData = await db
          .select({
            date: sql<string>`DATE(${schema.screenings.scrapedAt})`,
            count: count(),
          })
          .from(schema.screenings)
          .where(
            and(
              eq(schema.screenings.cinemaId, cinema.id),
              gte(schema.screenings.scrapedAt, sevenDaysAgo)
            )
          )
          .groupBy(sql`DATE(${schema.screenings.scrapedAt})`);

        const screeningCount = Number(currentResult?.count ?? 0);
        const averageCount =
          historicalData.length > 0
            ? historicalData.reduce((sum, d) => sum + Number(d.count), 0) /
              historicalData.length
            : screeningCount;

        const percentChange =
          averageCount > 0
            ? ((screeningCount - averageCount) / averageCount) * 100
            : 0;

        return {
          id: cinema.id,
          name: cinema.name,
          screeningCount,
          averageCount,
          percentChange,
        };
      })
    );

    // Build batched prompt
    const cinemaList = cinemaData
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} (${c.id}): ${c.screeningCount} screenings (avg: ${c.averageCount.toFixed(1)}, change: ${c.percentChange.toFixed(1)}%)`
      )
      .join("\n");

    const prompt = `Analyze the health of all cinema scrapers. For each cinema, determine if there are anomalies.

Cinemas:
${cinemaList}

Rules:
- A drop of >50% from average is suspicious
- A drop of >80% should block the scrape
- Zero screenings is always an anomaly
- Small cinemas (avg <10) may naturally have high variance

For EACH cinema, respond with a JSON array:
[
  {
    "cinemaId": "cinema-id",
    "anomalyScore": 0-1,
    "anomalyDetected": boolean,
    "shouldBlockScrape": boolean,
    "warnings": ["list of issues"],
    "recommendation": "brief recommendation"
  },
  ...
]

Only include cinemas with anomalies or notable issues. If a cinema looks healthy, you can omit it or include with anomalyDetected: false.`;

    // Single AI call for all cinemas
    const response = await generateTextWithUsage(prompt, {
      systemPrompt: CINEMA_AGENT_SYSTEM_PROMPT,
    });

    const tokensUsed = response.tokensUsed;

    // Parse response
    let aiResults: Array<{
      cinemaId: string;
      anomalyScore: number;
      anomalyDetected: boolean;
      shouldBlockScrape: boolean;
      warnings: string[];
      recommendation: string;
    }> = [];

    try {
      const responseText = response.text;

      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiResults = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse batched response:", parseError);
    }

    // Build reports for all cinemas
    const reports: ScraperHealthReport[] = cinemaData.map((cinema) => {
      const aiResult = aiResults.find((r) => r.cinemaId === cinema.id);

      const report: ScraperHealthReport = {
        cinemaId: cinema.id,
        cinemaName: cinema.name,
        scrapedAt: now,
        screeningCount: cinema.screeningCount,
        averageCountLast7Days: cinema.averageCount,
        percentChange: cinema.percentChange,
        anomalyScore: aiResult?.anomalyScore || 0,
        anomalyDetected: aiResult?.anomalyDetected || false,
        shouldBlockScrape: aiResult?.shouldBlockScrape || false,
        warnings: aiResult?.warnings || [],
        recommendation: aiResult?.recommendation || "",
      };

      // Apply heuristic checks
      if (cinema.percentChange < -50 && cinema.averageCount > 10) {
        report.anomalyDetected = true;
        if (!report.warnings.some((w) => w.includes("drop"))) {
          report.warnings.push(
            `Large drop: ${cinema.percentChange.toFixed(1)}% decrease from average`
          );
        }
        if (cinema.percentChange < -80) {
          report.shouldBlockScrape = true;
          report.anomalyScore = Math.max(report.anomalyScore, 0.9);
        }
      }

      if (cinema.screeningCount === 0) {
        report.anomalyDetected = true;
        report.shouldBlockScrape = true;
        report.anomalyScore = 1.0;
        if (!report.warnings.some((w) => w.includes("Zero"))) {
          report.warnings.push("Zero screenings - scraper likely broken");
        }
      }

      return report;
    });

    const anomalies = reports.filter((r) => r.anomalyDetected);
    console.log(
      `[${AGENT_NAME}] Checked ${reports.length} cinemas, found ${anomalies.length} anomalies`
    );

    return {
      success: true,
      data: reports,
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
