"use client";

/**
 * FestivalKeyDates Component
 * Displays key dates: programme announcement, member sale, public sale
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Megaphone,
  Users,
  Globe,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { format, isPast, formatDistanceToNow } from "date-fns";

interface FestivalKeyDatesProps {
  startDate: string;
  endDate: string;
  programmAnnouncedDate: string | null;
  memberSaleDate: Date | null;
  publicSaleDate: Date | null;
  status: "upcoming" | "ongoing" | "past";
}

interface DateItemProps {
  icon: React.ReactNode;
  label: string;
  date: Date | null;
  endDate?: Date | null;
  isPassed: boolean;
  showTime?: boolean;
}

function DateItem({ icon, label, date, endDate, isPassed, showTime = false }: DateItemProps) {
  if (!date) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-background-tertiary/50">
        <div className="text-text-tertiary mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="text-xs text-text-tertiary mt-0.5">To be announced</p>
        </div>
      </div>
    );
  }

  let formattedDate: string;
  if (endDate) {
    // Format date range
    const startMonth = format(date, "MMM");
    const endMonth = format(endDate, "MMM");
    const startDay = format(date, "d");
    const endDay = format(endDate, "d");
    const year = format(date, "yyyy");

    if (startMonth === endMonth) {
      formattedDate = `${startMonth} ${startDay}-${endDay}, ${year}`;
    } else {
      formattedDate = `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
    }
  } else {
    formattedDate = showTime
      ? format(date, "EEE d MMM, h:mm a")
      : format(date, "EEE d MMMM yyyy");
  }

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg transition-colors ${
        isPassed
          ? "bg-accent-success/5 border border-accent-success/20"
          : "bg-background-tertiary/50"
      }`}
    >
      <div className={isPassed ? "text-accent-success" : "text-text-tertiary"}>
        {isPassed ? <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> : icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {isPassed ? (
            <Badge variant="success" size="sm">
              Done
            </Badge>
          ) : (
            <Badge variant="default" size="sm">
              <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
              {formatDistanceToNow(date, { addSuffix: true })}
            </Badge>
          )}
        </div>
        <p className="text-sm text-text-secondary mt-1">{formattedDate}</p>
      </div>
    </div>
  );
}

export function FestivalKeyDates({
  startDate,
  endDate,
  programmAnnouncedDate,
  memberSaleDate,
  publicSaleDate,
  status,
}: FestivalKeyDatesProps) {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const programmeDate = programmAnnouncedDate
    ? new Date(programmAnnouncedDate)
    : null;

  // For past festivals, all dates are in the past
  const allPast = status === "past";

  return (
    <div>
      <h2 className="text-xl font-display text-text-primary mb-4">Key Dates</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Festival Dates */}
        <DateItem
          icon={<Calendar className="w-5 h-5" aria-hidden="true" />}
          label="Festival Dates"
          date={start}
          endDate={end}
          isPassed={isPast(end)}
        />

        {/* Programme Announcement */}
        <DateItem
          icon={<Megaphone className="w-5 h-5" aria-hidden="true" />}
          label="Programme Announced"
          date={programmeDate}
          isPassed={programmeDate ? isPast(programmeDate) : false}
        />

        {/* Member Sale */}
        <DateItem
          icon={<Users className="w-5 h-5" aria-hidden="true" />}
          label="Member Ticket Sale"
          date={memberSaleDate}
          isPassed={memberSaleDate ? isPast(memberSaleDate) : false}
          showTime={true}
        />

        {/* Public Sale */}
        <DateItem
          icon={<Globe className="w-5 h-5" aria-hidden="true" />}
          label="Public Ticket Sale"
          date={publicSaleDate}
          isPassed={publicSaleDate ? isPast(publicSaleDate) : false}
          showTime={true}
        />
      </div>

      {/* Ticket tip */}
      {status === "upcoming" && memberSaleDate && !isPast(memberSaleDate) && (
        <p className="text-xs text-text-tertiary mt-4">
          Tip: Festival members often get early access to tickets. Check the
          official website for membership options.
        </p>
      )}
    </div>
  );
}
