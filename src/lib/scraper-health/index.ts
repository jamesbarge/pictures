/**
 * Scraper Health Service
 *
 * Monitors scraper health by tracking:
 * - Freshness: How recently was the cinema scraped?
 * - Volume: How many future screenings exist?
 * - Anomalies: Are there sudden drops or suspicious patterns?
 *
 * Health checks run:
 * 1. Post-scrape: After each scraper run
 * 2. Daily cron: 7am UTC (after 6am scheduled scrapers)
 */

import { db } from "@/db";
import { screenings, healthSnapshots, cinemas } from "@/db/schema";
import { eq, gte, and, sql, desc, count } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { addDays, differenceInHours, subDays } from "date-fns";
import {
  HEALTH_THRESHOLDS,
  ANOMALY_REASONS,
  type AnomalyReason,
} from "@/db/schema/health-snapshots";
import { getCinemaById, getActiveCinemasByChain, getActiveCinemas } from "@/config/cinema-registry";

// ============================================================================
// Types
// ============================================================================

export interface CinemaHealthMetrics {
  cinemaId: string;
  cinemaName: string;
  chain: string | null;

  // Volume
  totalFutureScreenings: number;
  next14dScreenings: number;
  next7dScreenings: number;

  // Freshness
  lastScrapeAt: Date | null;
  hoursSinceLastScrape: number | null;

  // Scores
  overallHealthScore: number;
  freshnessScore: number;
  volumeScore: number;

  // Anomalies
  isAnomaly: boolean;
  anomalyReasons: AnomalyReason[];

  // Chain comparison
  chainMedian: number | null;
  percentOfChainMedian: number | null;

  // Alert status
  alertType: string | null;
}

export interface HealthCheckResult {
  timestamp: Date;
  totalCinemas: number;
  healthyCinemas: number;
  warnCinemas: number;
  criticalCinemas: number;
  metrics: CinemaHealthMetrics[];
  alerts: HealthAlert[];
}

export interface HealthAlert {
  cinemaId: string;
  cinemaName: string;
  alertType: "critical_stale" | "warning_stale" | "critical_volume" | "warning_volume" | "anomaly";
  message: string;
  hoursSinceLastScrape: number | null;
  screeningsCount: number;
}

// ============================================================================
// Core Health Check Functions
// ============================================================================

/**
 * Get health metrics for a single cinema
 */
export async function getCinemaHealthMetrics(cinemaId: string): Promise<CinemaHealthMetrics | null> {
  const now = new Date();
  const in7days = addDays(now, 7);
  const in14days = addDays(now, 14);

  // Get cinema info from registry (resolves legacy IDs to canonical)
  const cinemaInfo = getCinemaById(cinemaId);
  if (!cinemaInfo) return null;

  // Use canonical ID for database queries (cinemaInfo.id, not the input cinemaId)
  const canonicalId = cinemaInfo.id;

  // Get volume metrics
  const [volumeResult] = await db
    .select({
      total: count(),
      next7d: sql<number>`COUNT(*) FILTER (WHERE ${screenings.datetime} < ${in7days})`,
      next14d: sql<number>`COUNT(*) FILTER (WHERE ${screenings.datetime} < ${in14days})`,
      lastScrapedFromScreenings: sql<Date>`MAX(${screenings.scrapedAt})`,
    })
    .from(screenings)
    .where(
      and(
        eq(screenings.cinemaId, canonicalId),
        gte(screenings.datetime, now)
      )
    );

  // Freshness should use cinema-level lastScrapedAt so zero-result runs are still counted.
  const [cinemaResult] = await db
    .select({
      lastScrapedAt: cinemas.lastScrapedAt,
    })
    .from(cinemas)
    .where(eq(cinemas.id, canonicalId))
    .limit(1);

  const totalFutureScreenings = Number(volumeResult?.total) || 0;
  const next7dScreenings = Number(volumeResult?.next7d) || 0;
  const next14dScreenings = Number(volumeResult?.next14d) || 0;
  const lastScrapeAt =
    cinemaResult?.lastScrapedAt || volumeResult?.lastScrapedFromScreenings || null;

  // Calculate hours since last scrape
  const hoursSinceLastScrape = lastScrapeAt
    ? differenceInHours(now, lastScrapeAt)
    : null;

  // Calculate freshness score (100 = just scraped, 0 = very stale)
  const freshnessScore = calculateFreshnessScore(hoursSinceLastScrape);

  // Get chain median for comparison
  let chainMedian: number | null = null;
  let percentOfChainMedian: number | null = null;

  if (cinemaInfo.chain) {
    const chainCinemas = getActiveCinemasByChain(cinemaInfo.chain);
    const chainVolumes = await Promise.all(
      chainCinemas
        .filter((c) => c.id !== canonicalId) // Exclude current cinema
        .map(async (c) => {
          const [result] = await db
            .select({ count: count() })
            .from(screenings)
            .where(
              and(
                eq(screenings.cinemaId, c.id),
                gte(screenings.datetime, now)
              )
            );
          return Number(result?.count) || 0;
        })
    );

    if (chainVolumes.length > 0) {
      chainMedian = median(chainVolumes);
      percentOfChainMedian = chainMedian > 0
        ? (totalFutureScreenings / chainMedian) * 100
        : totalFutureScreenings > 0 ? 100 : 0;
    }
  }

  // Calculate volume score
  const volumeScore = calculateVolumeScore(totalFutureScreenings, chainMedian);

  // Calculate overall health score (weighted average)
  const overallHealthScore = Math.round(freshnessScore * 0.6 + volumeScore * 0.4);

  // Detect anomalies
  const anomalyReasons: AnomalyReason[] = [];

  if (hoursSinceLastScrape !== null && hoursSinceLastScrape >= HEALTH_THRESHOLDS.CRITICAL_STALE_HOURS) {
    anomalyReasons.push(ANOMALY_REASONS.CRITICAL_STALE);
  } else if (hoursSinceLastScrape !== null && hoursSinceLastScrape >= HEALTH_THRESHOLDS.WARNING_STALE_HOURS) {
    anomalyReasons.push(ANOMALY_REASONS.WARNING_STALE);
  }

  if (totalFutureScreenings === 0) {
    anomalyReasons.push(ANOMALY_REASONS.ZERO_SCREENINGS);
  } else if (percentOfChainMedian !== null && percentOfChainMedian < HEALTH_THRESHOLDS.WARNING_VOLUME_PERCENT) {
    anomalyReasons.push(ANOMALY_REASONS.LOW_VOLUME);
  }

  const isAnomaly = anomalyReasons.length > 0;

  // Determine alert type
  let alertType: string | null = null;
  if (anomalyReasons.includes(ANOMALY_REASONS.CRITICAL_STALE)) {
    alertType = "critical_stale";
  } else if (anomalyReasons.includes(ANOMALY_REASONS.ZERO_SCREENINGS)) {
    alertType = "critical_volume";
  } else if (anomalyReasons.includes(ANOMALY_REASONS.WARNING_STALE)) {
    alertType = "warning_stale";
  } else if (anomalyReasons.includes(ANOMALY_REASONS.LOW_VOLUME)) {
    alertType = "warning_volume";
  }

  return {
    cinemaId: canonicalId,
    cinemaName: cinemaInfo.name,
    chain: cinemaInfo.chain,
    totalFutureScreenings,
    next14dScreenings,
    next7dScreenings,
    lastScrapeAt,
    hoursSinceLastScrape,
    overallHealthScore,
    freshnessScore,
    volumeScore,
    isAnomaly,
    anomalyReasons,
    chainMedian,
    percentOfChainMedian,
    alertType,
  };
}

/**
 * Run health check for all active cinemas
 */
export async function runFullHealthCheck(): Promise<HealthCheckResult> {
  const timestamp = new Date();
  const metrics: CinemaHealthMetrics[] = [];
  const alerts: HealthAlert[] = [];

  // Get active cinemas from registry (not database) to avoid noisy alerts for inactive/newly seeded cinemas
  const activeCinemas = getActiveCinemas();

  // Get health metrics for each cinema
  for (const cinema of activeCinemas) {
    const cinemaMetrics = await getCinemaHealthMetrics(cinema.id);
    if (cinemaMetrics) {
      metrics.push(cinemaMetrics);

      // Create alerts for anomalies
      if (cinemaMetrics.isAnomaly && cinemaMetrics.alertType) {
        alerts.push({
          cinemaId: cinema.id,
          cinemaName: cinema.name,
          alertType: cinemaMetrics.alertType as HealthAlert["alertType"],
          message: generateAlertMessage(cinemaMetrics),
          hoursSinceLastScrape: cinemaMetrics.hoursSinceLastScrape,
          screeningsCount: cinemaMetrics.totalFutureScreenings,
        });
      }
    }
  }

  // Count by health status
  const healthyCinemas = metrics.filter((m) => m.overallHealthScore >= HEALTH_THRESHOLDS.HEALTHY_SCORE).length;
  const warnCinemas = metrics.filter(
    (m) => m.overallHealthScore >= HEALTH_THRESHOLDS.WARNING_SCORE && m.overallHealthScore < HEALTH_THRESHOLDS.HEALTHY_SCORE
  ).length;
  const criticalCinemas = metrics.filter((m) => m.overallHealthScore < HEALTH_THRESHOLDS.WARNING_SCORE).length;

  return {
    timestamp,
    totalCinemas: metrics.length,
    healthyCinemas,
    warnCinemas,
    criticalCinemas,
    metrics,
    alerts,
  };
}

/**
 * Save health snapshot to database
 */
export async function saveHealthSnapshot(metrics: CinemaHealthMetrics): Promise<string> {
  const id = uuidv4();

  await db.insert(healthSnapshots).values({
    id,
    cinemaId: metrics.cinemaId,
    snapshotAt: new Date(),
    totalFutureScreenings: metrics.totalFutureScreenings,
    next14dScreenings: metrics.next14dScreenings,
    next7dScreenings: metrics.next7dScreenings,
    lastScrapeAt: metrics.lastScrapeAt,
    hoursSinceLastScrape: metrics.hoursSinceLastScrape,
    overallHealthScore: metrics.overallHealthScore,
    freshnessScore: metrics.freshnessScore,
    volumeScore: metrics.volumeScore,
    isAnomaly: metrics.isAnomaly,
    anomalyReasons: metrics.anomalyReasons,
    chainMedian: metrics.chainMedian,
    percentOfChainMedian: metrics.percentOfChainMedian,
    triggeredAlert: metrics.alertType !== null,
    alertType: metrics.alertType as any,
  });

  return id;
}

/**
 * Get recent health snapshots for a cinema
 */
export async function getRecentHealthSnapshots(
  cinemaId: string,
  days: number = 7
): Promise<typeof healthSnapshots.$inferSelect[]> {
  const since = subDays(new Date(), days);

  // Resolve to canonical ID for database query
  const cinemaInfo = getCinemaById(cinemaId);
  const canonicalId = cinemaInfo?.id || cinemaId;

  return db
    .select()
    .from(healthSnapshots)
    .where(
      and(
        eq(healthSnapshots.cinemaId, canonicalId),
        gte(healthSnapshots.snapshotAt, since)
      )
    )
    .orderBy(desc(healthSnapshots.snapshotAt));
}

// ============================================================================
// Score Calculation Functions
// ============================================================================

function calculateFreshnessScore(hoursSinceLastScrape: number | null): number {
  if (hoursSinceLastScrape === null) return 0;

  const { CRITICAL_STALE_HOURS, WARNING_STALE_HOURS, HEALTHY_MAX_HOURS } = HEALTH_THRESHOLDS;

  if (hoursSinceLastScrape <= HEALTHY_MAX_HOURS) {
    // Linear scale from 100 (0h) to 80 (24h)
    return Math.round(100 - (hoursSinceLastScrape / HEALTHY_MAX_HOURS) * 20);
  } else if (hoursSinceLastScrape <= WARNING_STALE_HOURS) {
    // Linear scale from 80 (24h) to 60 (48h)
    const hoursOver = hoursSinceLastScrape - HEALTHY_MAX_HOURS;
    return Math.round(80 - (hoursOver / (WARNING_STALE_HOURS - HEALTHY_MAX_HOURS)) * 20);
  } else if (hoursSinceLastScrape <= CRITICAL_STALE_HOURS) {
    // Linear scale from 60 (48h) to 30 (72h)
    const hoursOver = hoursSinceLastScrape - WARNING_STALE_HOURS;
    return Math.round(60 - (hoursOver / (CRITICAL_STALE_HOURS - WARNING_STALE_HOURS)) * 30);
  } else {
    // Very stale: scale from 30 (72h) to 0 (144h+)
    const hoursOver = hoursSinceLastScrape - CRITICAL_STALE_HOURS;
    return Math.max(0, Math.round(30 - (hoursOver / 72) * 30));
  }
}

function calculateVolumeScore(totalScreenings: number, chainMedian: number | null): number {
  // If no screenings, score is 0
  if (totalScreenings === 0) return 0;

  // If we have chain median for comparison
  if (chainMedian !== null && chainMedian > 0) {
    const percentOfMedian = (totalScreenings / chainMedian) * 100;

    if (percentOfMedian >= 100) return 100;
    if (percentOfMedian >= 80) return 90;
    if (percentOfMedian >= 60) return 70;
    if (percentOfMedian >= 40) return 50;
    if (percentOfMedian >= 20) return 30;
    return 20;
  }

  // For independents without chain comparison, use absolute thresholds
  if (totalScreenings >= 50) return 100;
  if (totalScreenings >= 30) return 90;
  if (totalScreenings >= 15) return 70;
  if (totalScreenings >= 5) return 50;
  return 30;
}

// ============================================================================
// Utility Functions
// ============================================================================

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function generateAlertMessage(metrics: CinemaHealthMetrics): string {
  const parts: string[] = [];

  if (metrics.anomalyReasons.includes(ANOMALY_REASONS.CRITICAL_STALE)) {
    parts.push(`critically stale (${Math.round(metrics.hoursSinceLastScrape!)}h since last scrape)`);
  } else if (metrics.anomalyReasons.includes(ANOMALY_REASONS.WARNING_STALE)) {
    parts.push(`stale (${Math.round(metrics.hoursSinceLastScrape!)}h since last scrape)`);
  }

  if (metrics.anomalyReasons.includes(ANOMALY_REASONS.ZERO_SCREENINGS)) {
    parts.push("zero future screenings");
  } else if (metrics.anomalyReasons.includes(ANOMALY_REASONS.LOW_VOLUME)) {
    parts.push(`low volume (${metrics.totalFutureScreenings} screenings, ${Math.round(metrics.percentOfChainMedian!)}% of chain median)`);
  }

  return `${metrics.cinemaName}: ${parts.join(", ")}`;
}

// ============================================================================
// Post-Scrape Hook
// ============================================================================

/**
 * Run health check after a scraper completes
 * Called from pipeline.ts
 */
export async function postScrapeHealthCheck(cinemaId: string): Promise<void> {
  const metrics = await getCinemaHealthMetrics(cinemaId);
  if (!metrics) return;

  // Save snapshot
  await saveHealthSnapshot(metrics);

  // Log if anomaly detected
  if (metrics.isAnomaly) {
    console.warn(
      `[health] Anomaly detected for ${metrics.cinemaName}:`,
      metrics.anomalyReasons.join(", ")
    );
  }
}
