/**
 * Admin Operations Dashboard
 *
 * Operational view for scraper health and rapid interventions.
 * Uses scraper-health service metrics (same logic as /api/admin/health)
 * so statuses are consistent and auditable.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Siren,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { runFullHealthCheck, type CinemaHealthMetrics } from "@/lib/scraper-health";
import { HEALTH_THRESHOLDS, ANOMALY_REASONS } from "@/db/schema/health-snapshots";
import { RescanAllButton } from "./anomalies/components/rescan-all-button";
import { ReScrapeButton } from "./anomalies/components/re-scrape-button";

export const dynamic = "force-dynamic";

type DashboardStatus = "healthy" | "warning" | "critical";

function getDashboardStatus(score: number): DashboardStatus {
  if (score >= HEALTH_THRESHOLDS.HEALTHY_SCORE) return "healthy";
  if (score >= HEALTH_THRESHOLDS.WARNING_SCORE) return "warning";
  return "critical";
}

function getStatusBadgeVariant(status: DashboardStatus): "success" | "warning" | "danger" {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  return "danger";
}

function formatLastScrape(metrics: CinemaHealthMetrics): { label: string; sublabel: string } {
  if (!metrics.lastScrapeAt || metrics.hoursSinceLastScrape === null) {
    return { label: "Never", sublabel: "No successful scrape recorded" };
  }

  return {
    label: format(metrics.lastScrapeAt, "dd MMM HH:mm"),
    sublabel: `${Math.round(metrics.hoursSinceLastScrape)}h ago`,
  };
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case ANOMALY_REASONS.CRITICAL_STALE:
      return "Critically stale";
    case ANOMALY_REASONS.WARNING_STALE:
      return "Stale";
    case ANOMALY_REASONS.ZERO_SCREENINGS:
      return "Zero screenings";
    case ANOMALY_REASONS.LOW_VOLUME:
      return "Low volume";
    case ANOMALY_REASONS.SUDDEN_DROP:
      return "Sudden drop";
    case ANOMALY_REASONS.PARSE_ERROR_SUSPECTED:
      return "Parse issue suspected";
    default:
      return reason;
  }
}

function sortByUrgency(metrics: CinemaHealthMetrics[]): CinemaHealthMetrics[] {
  return [...metrics].sort((a, b) => {
    if (a.isAnomaly !== b.isAnomaly) {
      return a.isAnomaly ? -1 : 1;
    }

    if (a.overallHealthScore !== b.overallHealthScore) {
      return a.overallHealthScore - b.overallHealthScore;
    }

    return a.cinemaName.localeCompare(b.cinemaName);
  });
}

function formatChainComparison(metrics: CinemaHealthMetrics): string {
  if (metrics.percentOfChainMedian === null || metrics.chainMedian === null) {
    return "Independent/No peer baseline";
  }

  return `${Math.round(metrics.percentOfChainMedian)}% of chain median (${metrics.chainMedian})`;
}

export default async function AdminDashboard() {
  const result = await runFullHealthCheck();
  const now = new Date();

  const orderedMetrics = sortByUrgency(result.metrics);
  const staleCinemas = result.metrics.filter(
    (metric) =>
      metric.hoursSinceLastScrape !== null &&
      metric.hoursSinceLastScrape >= HEALTH_THRESHOLDS.WARNING_STALE_HOURS
  );

  const zeroScreeningCinemas = result.metrics.filter(
    (metric) => metric.totalFutureScreenings === 0
  );

  const criticalRows = orderedMetrics.filter(
    (metric) => getDashboardStatus(metric.overallHealthScore) === "critical"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Admin Operations</h1>
          <p className="text-text-secondary mt-1">
            Scraper health, freshness, and manual intervention controls. Refreshed at {format(now, "HH:mm")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RescanAllButton />
          <Link href="/admin/anomalies">
            <Button variant="secondary" size="sm">
              <Siren className="w-4 h-4 mr-2" />
              Review Anomalies
            </Button>
          </Link>
          <Link href="/admin/screenings">
            <Button variant="ghost" size="sm">
              <Activity className="w-4 h-4 mr-2" />
              Manage Screenings
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <SummaryCard
          label="Cinemas"
          value={result.totalCinemas}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="default"
        />
        <SummaryCard
          label="Healthy"
          value={result.healthyCinemas}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="success"
        />
        <SummaryCard
          label="Warning"
          value={result.warnCinemas}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="warning"
        />
        <SummaryCard
          label="Critical"
          value={result.criticalCinemas}
          icon={<ShieldAlert className="w-4 h-4" />}
          tone="danger"
        />
        <SummaryCard
          label="Stale >48h"
          value={staleCinemas.length}
          icon={<Clock3 className="w-4 h-4" />}
          tone={staleCinemas.length > 0 ? "warning" : "default"}
        />
      </div>

      {(criticalRows.length > 0 || zeroScreeningCinemas.length > 0) && (
        <Card className="border-l-4 border-l-red-500 bg-red-500/5">
          <CardHeader
            heading="Immediate Attention"
            subtitle="These cinemas are most likely to need intervention now"
          />
          <CardContent className="space-y-3">
            {criticalRows.slice(0, 6).map((metric) => (
              <div
                key={metric.cinemaId}
                className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-background-secondary p-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{metric.cinemaName}</p>
                  <p className="text-sm text-text-secondary">
                    Score {metric.overallHealthScore} • {metric.totalFutureScreenings} future screenings • {formatChainComparison(metric)}
                  </p>
                  {metric.anomalyReasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {metric.anomalyReasons.map((reason) => (
                        <Badge key={`${metric.cinemaId}-${reason}`} size="sm" variant="danger">
                          {reasonLabel(reason)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ReScrapeButton cinemaId={metric.cinemaId} variant="secondary" />
                  <Link href={`/admin/screenings?cinema=${metric.cinemaId}`}>
                    <Button variant="ghost" size="sm">Open</Button>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader
          heading="Cinema Health Matrix"
          subtitle="Status is computed from scraper freshness + volume scoring. Use Re-scrape to queue a run for one cinema."
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-background-tertiary/60 border-y border-border-subtle">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-text-secondary">Cinema</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Status</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Health Score</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Future Screenings</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Last Scrape</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Chain Comparison</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Flags</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedMetrics.map((metric) => {
                  const status = getDashboardStatus(metric.overallHealthScore);
                  const lastScrape = formatLastScrape(metric);

                  return (
                    <tr
                      key={metric.cinemaId}
                      className={cn(
                        "border-b border-border-subtle align-top",
                        metric.isAnomaly && "bg-red-500/5"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-text-primary">{metric.cinemaName}</p>
                          <p className="text-xs text-text-tertiary">{metric.cinemaId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge size="sm" variant={getStatusBadgeVariant(status)}>
                          {status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-text-primary">{metric.overallHealthScore}</p>
                        <p className="text-xs text-text-tertiary">
                          Freshness {metric.freshnessScore} • Volume {metric.volumeScore}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-text-primary">{metric.totalFutureScreenings}</p>
                        <p className="text-xs text-text-tertiary">Next 7d: {metric.next7dScreenings}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-text-primary">{lastScrape.label}</p>
                        <p className="text-xs text-text-tertiary">{lastScrape.sublabel}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-text-secondary">{formatChainComparison(metric)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {metric.anomalyReasons.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {metric.anomalyReasons.map((reason) => (
                              <Badge key={`${metric.cinemaId}-flag-${reason}`} size="sm" variant="warning">
                                {reasonLabel(reason)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-text-tertiary">No active flags</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ReScrapeButton cinemaId={metric.cinemaId} variant="ghost" />
                          <Link href={`/admin/screenings?cinema=${metric.cinemaId}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader heading="Health Rules" subtitle="Current thresholds used by scraper-health" />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <RulePill label="Healthy score" value={`>= ${HEALTH_THRESHOLDS.HEALTHY_SCORE}`} />
            <RulePill label="Warning score" value={`${HEALTH_THRESHOLDS.WARNING_SCORE}-${HEALTH_THRESHOLDS.HEALTHY_SCORE - 1}`} />
            <RulePill label="Critical stale" value={`>= ${HEALTH_THRESHOLDS.CRITICAL_STALE_HOURS}h`} />
            <RulePill label="Low chain volume" value={`< ${HEALTH_THRESHOLDS.WARNING_VOLUME_PERCENT}%`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const toneStyles = {
    default: "",
    success: "border-l-4 border-l-green-500",
    warning: "border-l-4 border-l-yellow-500",
    danger: "border-l-4 border-l-red-500",
  };

  return (
    <Card className={toneStyles[tone]}>
      <div className="p-4">
        <div className="flex items-center gap-2 text-text-secondary">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-mono text-text-primary">{value}</p>
      </div>
    </Card>
  );
}

function RulePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-secondary px-3 py-2">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="font-mono text-text-primary mt-1">{value}</p>
    </div>
  );
}
