"use client";

/**
 * Anomaly List Component
 * Client-side wrapper that filters out dismissed anomalies
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { ReScrapeButton } from "./re-scrape-button";
import { DismissButton, isAnomalyDismissed } from "./dismiss-button";
import { AIVerifyButton } from "./ai-verify-button";

export interface DetectedAnomaly {
  cinemaId: string;
  cinemaName: string;
  type: "low_count" | "zero_results" | "high_variance";
  severity: "warning" | "error";
  todayCount: number;
  lastWeekCount: number;
  percentChange: number;
  detectedAt: string;
}

interface AnomalyListProps {
  anomalies: DetectedAnomaly[];
}

export function AnomalyList({ anomalies }: AnomalyListProps) {
  // null = not yet hydrated (server render shows all), array = client-filtered
  const [clientFiltered, setClientFiltered] = useState<DetectedAnomaly[] | null>(null);

  // Filter out dismissed anomalies on mount
  useEffect(() => {
    const filtered = anomalies.filter(
      a => !isAnomalyDismissed(a.cinemaId, a.todayCount)
    );
    setClientFiltered(filtered);
  }, [anomalies]);

  // Handle dismiss - remove from visible list
  function handleDismiss(cinemaId: string) {
    setClientFiltered(prev => prev?.filter(a => a.cinemaId !== cinemaId) ?? null);
  }

  // Show all anomalies on server render, filtered on client
  const displayAnomalies = clientFiltered ?? anomalies;

  if (displayAnomalies.length === 0) {
    return (
      <Card className="text-center py-12">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-text-primary">All systems healthy</p>
        <p className="text-sm text-text-secondary mt-1">
          No anomalies detected comparing today with last week
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-display text-text-primary">
        Detected Issues ({displayAnomalies.length})
      </h2>
      {displayAnomalies.map((anomaly, index) => (
        <AnomalyCard
          key={`${anomaly.cinemaId}-${index}`}
          anomaly={anomaly}
          onDismiss={() => handleDismiss(anomaly.cinemaId)}
        />
      ))}
    </div>
  );
}

const typeLabels = {
  zero_results: "Zero Results",
  low_count: "Low Count",
  high_variance: "High Variance",
};

const typeDescriptions = {
  zero_results: "No screenings found but had listings last week",
  low_count: "Significantly fewer screenings than expected",
  high_variance: "Unusually high count - possible duplicates",
};

function AnomalyCard({
  anomaly,
  onDismiss,
}: {
  anomaly: DetectedAnomaly;
  onDismiss: () => void;
}) {
  return (
    <Card className={cn(
      "border-l-4",
      anomaly.severity === "error" ? "border-l-red-500 bg-red-500/5" : "border-l-yellow-500 bg-yellow-500/5"
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {anomaly.severity === "error" ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
              <h3 className="font-medium text-text-primary">{anomaly.cinemaName}</h3>
              <span className={cn(
                "text-xs px-2 py-0.5 rounded",
                anomaly.severity === "error" ? "bg-red-500/20 text-red-700" : "bg-yellow-500/20 text-yellow-700"
              )}>
                {typeLabels[anomaly.type]}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-1">
              {typeDescriptions[anomaly.type]}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-6 text-sm">
          <div>
            <span className="text-text-tertiary">Today:</span>
            <span className="font-mono ml-1 text-text-primary">{anomaly.todayCount}</span>
          </div>
          <div>
            <span className="text-text-tertiary">Last week:</span>
            <span className="font-mono ml-1 text-text-primary">{anomaly.lastWeekCount}</span>
          </div>
          <div>
            <span className="text-text-tertiary">Change:</span>
            <span className={cn(
              "font-mono ml-1",
              anomaly.percentChange < 0 ? "text-red-600" : "text-green-600"
            )}>
              {anomaly.percentChange > 0 ? "+" : ""}{anomaly.percentChange.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-subtle flex gap-2">
          <Link
            href={`/admin/screenings?cinema=${anomaly.cinemaId}`}
            className="text-sm text-accent-primary hover:underline"
          >
            View Screenings →
          </Link>
          <div className="ml-auto flex gap-2">
            <ReScrapeButton cinemaId={anomaly.cinemaId} />
            <AIVerifyButton cinemaId={anomaly.cinemaId} anomaly={anomaly} />
            <DismissButton
              cinemaId={anomaly.cinemaId}
              todayCount={anomaly.todayCount}
              onDismiss={onDismiss}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
