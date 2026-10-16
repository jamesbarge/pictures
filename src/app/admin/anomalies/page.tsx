/**
 * Admin Anomalies Page
 * Review and resolve data anomalies detected by the system
 */

import { db } from "@/db";
import { cinemas, screenings } from "@/db/schema";
import { eq, gte, lte, count, and } from "drizzle-orm";
import { startOfDay, endOfDay, subWeeks, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { AnomalyList, type DetectedAnomaly } from "./components/anomaly-list";
import { RescanAllButton } from "./components/rescan-all-button";

export const dynamic = "force-dynamic";

// Independent cinemas (top tier)
const INDEPENDENT_CHAINS = ["independent", null];

export default async function AdminAnomaliesPage() {
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  const lastWeekSameDay = subWeeks(today, 1);
  const lastWeekSameDayEnd = endOfDay(lastWeekSameDay);

  // Fetch all active cinemas
  const allCinemas = await db
    .select({
      id: cinemas.id,
      name: cinemas.name,
      shortName: cinemas.shortName,
      chain: cinemas.chain,
    })
    .from(cinemas)
    .where(eq(cinemas.isActive, true));

  // Get today's counts
  const todayCounts = await db
    .select({
      cinemaId: screenings.cinemaId,
      count: count(screenings.id),
    })
    .from(screenings)
    .where(
      and(
        gte(screenings.datetime, today),
        lte(screenings.datetime, todayEnd)
      )
    )
    .groupBy(screenings.cinemaId);

  // Get last week same day counts
  const lastWeekCounts = await db
    .select({
      cinemaId: screenings.cinemaId,
      count: count(screenings.id),
    })
    .from(screenings)
    .where(
      and(
        gte(screenings.datetime, lastWeekSameDay),
        lte(screenings.datetime, lastWeekSameDayEnd)
      )
    )
    .groupBy(screenings.cinemaId);

  // Build maps
  const todayMap = new Map(todayCounts.map(c => [c.cinemaId, c.count]));
  const lastWeekMap = new Map(lastWeekCounts.map(c => [c.cinemaId, c.count]));

  // Detect anomalies
  const anomalies: DetectedAnomaly[] = [];

  for (const cinema of allCinemas) {
    const todayCount = todayMap.get(cinema.id) || 0;
    const lastWeekCount = lastWeekMap.get(cinema.id) || 0;

    // Skip if both are zero (cinema might not have listings for this day)
    if (todayCount === 0 && lastWeekCount === 0) continue;

    const percentChange = lastWeekCount > 0
      ? ((todayCount - lastWeekCount) / lastWeekCount) * 100
      : todayCount > 0 ? 100 : -100;

    const isTopTier = INDEPENDENT_CHAINS.includes(cinema.chain);
    const threshold = isTopTier ? 30 : 50;

    // Zero results is always an error for cinemas that had screenings last week
    if (todayCount === 0 && lastWeekCount > 0) {
      anomalies.push({
        cinemaId: cinema.id,
        cinemaName: cinema.shortName || cinema.name,
        type: "zero_results",
        severity: "error",
        todayCount,
        lastWeekCount,
        percentChange,
        detectedAt: now.toISOString(),
      });
    }
    // Significant drop
    else if (percentChange < -threshold && lastWeekCount >= 3) {
      anomalies.push({
        cinemaId: cinema.id,
        cinemaName: cinema.shortName || cinema.name,
        type: "low_count",
        severity: isTopTier ? "error" : "warning",
        todayCount,
        lastWeekCount,
        percentChange,
        detectedAt: now.toISOString(),
      });
    }
    // Unusual increase (might indicate duplicate scraping)
    else if (percentChange > 100 && todayCount > lastWeekCount + 10) {
      anomalies.push({
        cinemaId: cinema.id,
        cinemaName: cinema.shortName || cinema.name,
        type: "high_variance",
        severity: "warning",
        todayCount,
        lastWeekCount,
        percentChange,
        detectedAt: now.toISOString(),
      });
    }
  }

  // Sort by severity (errors first)
  const sortedAnomalies = anomalies.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "error" ? -1 : 1;
    }
    return a.cinemaName.localeCompare(b.cinemaName);
  });

  const errorCount = anomalies.filter(a => a.severity === "error").length;
  const warningCount = anomalies.filter(a => a.severity === "warning").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Anomalies</h1>
          <p className="text-text-secondary mt-1">
            Review and resolve data issues detected by the system
          </p>
        </div>
        <RescanAllButton />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-text-secondary">Errors</span>
            </div>
            <p className="text-2xl font-mono text-text-primary mt-1">{errorCount}</p>
          </div>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span className="text-sm text-text-secondary">Warnings</span>
            </div>
            <p className="text-2xl font-mono text-text-primary mt-1">{warningCount}</p>
          </div>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm text-text-secondary">Healthy</span>
            </div>
            <p className="text-2xl font-mono text-text-primary mt-1">
              {allCinemas.length - anomalies.length}
            </p>
          </div>
        </Card>
      </div>

      {/* Comparison Info */}
      <Card>
        <CardContent>
          <p className="text-sm text-text-secondary">
            Comparing <strong>{format(today, "EEEE, d MMMM")}</strong> (today)
            with <strong>{format(lastWeekSameDay, "EEEE, d MMMM")}</strong> (same day last week).
            Independent cinemas alert at &gt;30% change, chains at &gt;50%.
          </p>
        </CardContent>
      </Card>

      {/* Anomaly List (client component handles dismiss filtering) */}
      <AnomalyList anomalies={sortedAnomalies} />
    </div>
  );
}
