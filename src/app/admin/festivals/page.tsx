/**
 * Festival Programme Status Dashboard
 * Shows festivals that need programme scraping, with alerts for currently running festivals
 */

import { db } from "@/db";
import { festivals, festivalScreenings } from "@/db/schema";
import { eq, count, asc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  ExternalLink,
  Film,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { format, differenceInDays, addWeeks } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

type FestivalStatus = "needs_scraping" | "ready" | "upcoming" | "past";

interface FestivalWithStatus {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  startDate: string;
  endDate: string;
  websiteUrl: string | null;
  programmAnnouncedDate: string | null;
  screeningCount: number;
  status: FestivalStatus;
  daysUntilStart: number;
  isCurrentlyRunning: boolean;
}

function getFestivalStatus(
  startDate: Date,
  endDate: Date,
  screeningCount: number,
  programmAnnouncedDate: string | null,
  now: Date
): { status: FestivalStatus; isCurrentlyRunning: boolean } {
  const isCurrentlyRunning = now >= startDate && now <= endDate;
  const isPast = now > endDate;
  if (isPast) {
    return { status: "past", isCurrentlyRunning: false };
  }

  // Currently running or upcoming - check if programme is scraped
  if (screeningCount > 0) {
    return { status: "ready", isCurrentlyRunning };
  }

  // No screenings - check if programme is announced
  if (programmAnnouncedDate || isCurrentlyRunning) {
    // Programme announced or festival is running - needs scraping!
    return { status: "needs_scraping", isCurrentlyRunning };
  }

  return { status: "upcoming", isCurrentlyRunning };
}

export default async function FestivalsAdminPage() {
  const now = new Date();

  // Get all active festivals with screening counts
  const festivalsData = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      slug: festivals.slug,
      shortName: festivals.shortName,
      startDate: festivals.startDate,
      endDate: festivals.endDate,
      websiteUrl: festivals.websiteUrl,
      programmAnnouncedDate: festivals.programmAnnouncedDate,
    })
    .from(festivals)
    .where(eq(festivals.isActive, true))
    .orderBy(asc(festivals.startDate));

  // Get screening counts for each festival
  const screeningCounts = await db
    .select({
      festivalId: festivalScreenings.festivalId,
      count: count(festivalScreenings.screeningId),
    })
    .from(festivalScreenings)
    .groupBy(festivalScreenings.festivalId);

  const countsMap = new Map(screeningCounts.map((c) => [c.festivalId, c.count]));

  // Build festival status data
  const festivalStatuses: FestivalWithStatus[] = festivalsData.map((f) => {
    const startDate = new Date(f.startDate);
    const endDate = new Date(f.endDate);
    const screeningCount = countsMap.get(f.id) || 0;
    const { status, isCurrentlyRunning } = getFestivalStatus(
      startDate,
      endDate,
      screeningCount,
      f.programmAnnouncedDate,
      now
    );
    const daysUntilStart = differenceInDays(startDate, now);

    return {
      ...f,
      screeningCount,
      status,
      daysUntilStart,
      isCurrentlyRunning,
    };
  });

  // Separate festivals by status
  const needsScraping = festivalStatuses.filter((f) => f.status === "needs_scraping");
  const ready = festivalStatuses.filter((f) => f.status === "ready");
  const upcoming = festivalStatuses.filter((f) => f.status === "upcoming");
  const past = festivalStatuses.filter((f) => f.status === "past");

  // Count urgent items (currently running without screenings)
  const urgentCount = needsScraping.filter((f) => f.isCurrentlyRunning).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-display text-text-primary">Festival Programmes</h1>
        <p className="text-text-secondary mt-1">
          Track programme announcements and scraping status
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Needs Scraping"
          value={needsScraping.length}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant={urgentCount > 0 ? "error" : needsScraping.length > 0 ? "warning" : "default"}
          subtext={urgentCount > 0 ? `${urgentCount} currently running!` : undefined}
        />
        <StatCard
          label="Ready"
          value={ready.length}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Awaiting Programme"
          value={upcoming.length}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          label="Past Festivals"
          value={past.length}
          icon={<Calendar className="w-5 h-5" />}
        />
      </div>

      {/* Needs Scraping - Priority Section */}
      {needsScraping.length > 0 && (
        <section>
          <h2 className="text-lg font-display text-text-primary mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Needs Programme Scraping
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {needsScraping.map((festival) => (
              <FestivalCard key={festival.id} festival={festival} />
            ))}
          </div>
        </section>
      )}

      {/* Ready Festivals */}
      {ready.length > 0 && (
        <section>
          <h2 className="text-lg font-display text-text-primary mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Programme Ready
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ready.map((festival) => (
              <FestivalCard key={festival.id} festival={festival} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Festivals */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-display text-text-primary mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-text-tertiary" />
            Awaiting Programme Announcement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((festival) => (
              <FestivalCard key={festival.id} festival={festival} />
            ))}
          </div>
          <p className="text-sm text-text-tertiary mt-4">
            Programmes typically announced 4-8 weeks before the festival. Check festival websites periodically.
          </p>
        </section>
      )}

      {/* Past Festivals (collapsed) */}
      {past.length > 0 && (
        <section>
          <details className="group">
            <summary className="text-lg font-display text-text-secondary mb-4 cursor-pointer hover:text-text-primary">
              Past Festivals ({past.length})
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {past.map((festival) => (
                <FestivalCard key={festival.id} festival={festival} />
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  subtext,
  variant = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "error";
}) {
  const variantStyles = {
    default: "",
    success: "border-l-4 border-l-green-500",
    warning: "border-l-4 border-l-yellow-500",
    error: "border-l-4 border-l-red-500",
  };

  const iconColors = {
    default: "text-text-tertiary",
    success: "text-green-500",
    warning: "text-yellow-500",
    error: "text-red-500",
  };

  return (
    <Card className={cn(variantStyles[variant])}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">{label}</p>
          <span className={iconColors[variant]}>{icon}</span>
        </div>
        <p className="text-2xl font-mono text-text-primary mt-1">{value}</p>
        {subtext && <p className="text-xs text-red-500 mt-1 font-medium">{subtext}</p>}
      </div>
    </Card>
  );
}

// Festival Card Component
function FestivalCard({ festival }: { festival: FestivalWithStatus }) {
  const statusConfig = {
    needs_scraping: {
      border: festival.isCurrentlyRunning ? "border-l-red-500" : "border-l-yellow-500",
      bg: festival.isCurrentlyRunning ? "bg-red-500/5" : "bg-yellow-500/5",
      badge: festival.isCurrentlyRunning ? "ON NOW - NEEDS SCRAPING" : "Needs Scraping",
      badgeClass: festival.isCurrentlyRunning
        ? "bg-red-500/10 text-red-600"
        : "bg-yellow-500/10 text-yellow-600",
    },
    ready: {
      border: "border-l-green-500",
      bg: "bg-green-500/5",
      badge: festival.isCurrentlyRunning ? "ON NOW" : "Ready",
      badgeClass: festival.isCurrentlyRunning
        ? "bg-green-500/10 text-green-600"
        : "bg-green-500/10 text-green-600",
    },
    upcoming: {
      border: "border-l-border-subtle",
      bg: "",
      badge: `In ${festival.daysUntilStart} days`,
      badgeClass: "bg-background-tertiary text-text-secondary",
    },
    past: {
      border: "border-l-border-subtle",
      bg: "opacity-60",
      badge: "Past",
      badgeClass: "bg-background-tertiary text-text-tertiary",
    },
  };

  const config = statusConfig[festival.status];

  // Estimate when programme should be announced (6 weeks before)
  const expectedAnnouncementDate = addWeeks(new Date(festival.startDate), -6);
  const daysUntilAnnouncement = differenceInDays(expectedAnnouncementDate, new Date());

  return (
    <Card className={cn("border-l-4", config.border, config.bg)}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary truncate">
              {festival.shortName || festival.name}
            </h3>
            <p className="text-sm text-text-secondary">
              {format(new Date(festival.startDate), "d MMM")} -{" "}
              {format(new Date(festival.endDate), "d MMM yyyy")}
            </p>
          </div>
          <span className={cn("text-xs px-2 py-1 rounded-full whitespace-nowrap", config.badgeClass)}>
            {config.badge}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-text-tertiary">
              <Film className="w-4 h-4" />
              <span>{festival.screeningCount} screenings</span>
            </div>
            {festival.websiteUrl && (
              <a
                href={festival.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary hover:underline flex items-center gap-1"
              >
                Website <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Show expected announcement for upcoming festivals */}
          {festival.status === "upcoming" && daysUntilAnnouncement > 0 && (
            <p className="text-xs text-text-tertiary mt-2">
              Programme expected ~{format(expectedAnnouncementDate, "d MMM")}
            </p>
          )}

          {/* Show link to festival page */}
          <Link
            href={`/festivals/${festival.slug}`}
            className="text-xs text-accent-primary hover:underline mt-2 block"
          >
            View festival page →
          </Link>
        </div>
      </div>
    </Card>
  );
}
