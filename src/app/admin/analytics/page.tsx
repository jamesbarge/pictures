/**
 * Admin Analytics Dashboard
 * Displays PostHog analytics data including events, recordings, and funnels
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Users,
  Activity,
  Video,
  TrendingUp,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  BarChart3,
  MousePointer,
  Eye,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { format, formatDistanceToNow } from "date-fns";

interface DashboardSummary {
  totalUsers: number;
  totalEvents: number;
  totalRecordings: number;
  topEvents: Array<{ name: string; count: number }>;
  recentRecordings: Array<{
    id: string;
    distinct_id: string;
    recording_duration: number;
    start_time: string;
    click_count: number;
    start_url: string;
    person?: { properties?: { email?: string } };
  }>;
}

interface FunnelData {
  steps: Array<{
    name: string;
    count: number;
    conversionRate: number;
  }>;
}

interface ApiError {
  error: string;
  details?: string;
  setup?: { required: string[] };
}

type DateRange = "-1d" | "-7d" | "-30d";

export default function AnalyticsDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("-7d");

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, funnelRes] = await Promise.all([
        fetch(`/api/admin/analytics?type=summary&dateFrom=${dateRange}`),
        fetch(`/api/admin/analytics?type=funnel&dateFrom=${dateRange}`),
      ]);

      if (!summaryRes.ok) {
        const errorData = await summaryRes.json();
        setError(errorData);
        return;
      }

      const summaryData = await summaryRes.json();
      const funnelData = funnelRes.ok ? await funnelRes.json() : null;

      setSummary(summaryData);
      setFunnel(funnelData);
    } catch (err) {
      setError({
        error: "Failed to fetch analytics",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Analytics</h1>
          <p className="text-text-secondary mt-1">
            PostHog analytics dashboard
          </p>
        </div>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-text-primary">{error.error}</h3>
                {error.details && (
                  <p className="text-sm text-text-secondary mt-1">
                    {error.details}
                  </p>
                )}
                {error.setup?.required && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-text-primary mb-2">
                      Required environment variables:
                    </p>
                    <ul className="text-sm text-text-secondary space-y-1">
                      {error.setup.required.map((req, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <code className="text-xs bg-background-tertiary px-1.5 py-0.5 rounded">
                            {req.split(" - ")[0]}
                          </code>
                          <span>{req.split(" - ")[1]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Analytics</h1>
          <p className="text-text-secondary mt-1">
            User behavior and engagement insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex bg-background-tertiary rounded-lg p-1">
            {(
              [
                { value: "-1d", label: "24h" },
                { value: "-7d", label: "7d" },
                { value: "-30d", label: "30d" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  dateRange === option.value
                    ? "bg-background-primary text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-background-tertiary hover:bg-background-hover text-text-secondary transition-colors"
          >
            <RefreshCw
              className={cn("w-4 h-4", loading && "animate-spin")}
            />
          </button>
          <a
            href="https://eu.posthog.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-background-tertiary hover:bg-background-hover text-text-secondary rounded-lg transition-colors"
          >
            PostHog
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="p-4 space-y-3">
                <div className="h-4 bg-background-tertiary rounded w-1/2" />
                <div className="h-8 bg-background-tertiary rounded w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="w-5 h-5" />}
              label="Total Users"
              value={summary?.totalUsers || 0}
              color="blue"
            />
            <StatCard
              icon={<Activity className="w-5 h-5" />}
              label="Total Events"
              value={summary?.totalEvents || 0}
              subtext="Last 30 days"
              color="green"
            />
            <StatCard
              icon={<Video className="w-5 h-5" />}
              label="Session Recordings"
              value={summary?.totalRecordings || 0}
              subtext={dateRange === "-1d" ? "Last 24h" : dateRange === "-7d" ? "Last 7 days" : "Last 30 days"}
              color="purple"
            />
            <StatCard
              icon={<BarChart3 className="w-5 h-5" />}
              label="Top Event"
              value={summary?.topEvents?.[0]?.count || 0}
              subtext={summary?.topEvents?.[0]?.name || "No events"}
              color="orange"
            />
          </div>

          {/* Conversion Funnel */}
          {funnel && funnel.steps.length > 0 && (
            <Card>
              <CardHeader heading="Conversion Funnel" />
              <CardContent>
                <div className="flex items-end gap-2 h-48">
                  {funnel.steps.map((step, i) => {
                    const height = `${Math.max(10, step.conversionRate)}%`;
                    return (
                      <div
                        key={step.name}
                        className="flex-1 flex flex-col items-center gap-2"
                      >
                        <div className="text-sm text-text-primary font-mono">
                          {step.count.toLocaleString()}
                        </div>
                        <div
                          className={cn(
                            "w-full rounded-t-lg transition-colors",
                            i === 0
                              ? "bg-accent-primary"
                              : i === funnel.steps.length - 1
                                ? "bg-green-500"
                                : "bg-accent-primary/60"
                          )}
                          style={{ height }}
                        />
                        <div className="text-xs text-text-secondary text-center">
                          {step.name}
                        </div>
                        {i > 0 && (
                          <div className="text-xs text-text-tertiary">
                            {step.conversionRate.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Events */}
            <Card>
              <CardHeader heading="Top Events (30 days)" />
              <CardContent>
                <div className="space-y-3">
                  {summary?.topEvents?.slice(0, 8).map((event, i) => (
                    <div
                      key={event.name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-tertiary font-mono w-4">
                          {i + 1}
                        </span>
                        <EventIcon eventName={event.name} />
                        <span className="text-sm text-text-primary">
                          {formatEventName(event.name)}
                        </span>
                      </div>
                      <span className="text-sm font-mono text-text-secondary">
                        {event.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {(!summary?.topEvents || summary.topEvents.length === 0) && (
                    <p className="text-sm text-text-tertiary text-center py-4">
                      No events recorded yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Session Recordings */}
            <Card>
              <CardHeader
                heading="Recent Recordings"
                action={
                  <a
                    href="https://eu.posthog.com/replay/recent"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-primary hover:underline"
                  >
                    View all →
                  </a>
                }
              />
              <CardContent>
                <div className="space-y-3">
                  {summary?.recentRecordings?.map((recording) => (
                    <a
                      key={recording.id}
                      href={`https://eu.posthog.com/replay/${recording.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 -mx-2 rounded-lg hover:bg-background-tertiary transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Video className="w-4 h-4 text-text-tertiary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {recording.person?.properties?.email ||
                              recording.distinct_id.slice(0, 12) + "..."}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {formatDistanceToNow(new Date(recording.start_time), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-text-secondary flex items-center gap-1">
                          <MousePointer className="w-3 h-3" />
                          {recording.click_count}
                        </span>
                        <span className="text-xs font-mono text-text-tertiary">
                          {formatDuration(recording.recording_duration)}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </a>
                  ))}
                  {(!summary?.recentRecordings ||
                    summary.recentRecordings.length === 0) && (
                    <p className="text-sm text-text-tertiary text-center py-4">
                      No session recordings yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// Helper Components

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtext?: string;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colorStyles = {
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-green-500/10 text-green-500",
    purple: "bg-purple-500/10 text-purple-500",
    orange: "bg-orange-500/10 text-orange-500",
  };

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className={cn("p-2 rounded-lg", colorStyles[color])}>{icon}</div>
          <span className="text-sm text-text-secondary">{label}</span>
        </div>
        <p className="text-2xl font-mono text-text-primary">
          {value.toLocaleString()}
        </p>
        {subtext && (
          <p className="text-xs text-text-tertiary mt-1">{subtext}</p>
        )}
      </div>
    </Card>
  );
}

function EventIcon({ eventName }: { eventName: string }) {
  if (eventName.includes("view")) return <Eye className="w-4 h-4 text-blue-500" />;
  if (eventName.includes("click")) return <MousePointer className="w-4 h-4 text-green-500" />;
  if (eventName.includes("booking")) return <ShoppingCart className="w-4 h-4 text-purple-500" />;
  if (eventName.includes("watchlist")) return <TrendingUp className="w-4 h-4 text-orange-500" />;
  return <Activity className="w-4 h-4 text-text-tertiary" />;
}

function formatEventName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
