/**
 * Date Filter Component
 * Horizontal scrollable pills for filtering by date range
 * Uses URL search params for server-side filtering
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

export type DatePeriod = "today" | "tomorrow" | "week" | "weekend" | "all";

const periods: { value: DatePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
  { value: "weekend", label: "Weekend" },
  { value: "all", label: "All" },
];

interface DateFilterProps {
  currentPeriod: DatePeriod;
}

export function DateFilter({ currentPeriod }: DateFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePeriodChange = (period: DatePeriod) => {
    const params = new URLSearchParams(searchParams.toString());

    if (period === "all") {
      params.delete("period");
    } else {
      params.set("period", period);
    }

    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/", { scroll: false });
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {periods.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handlePeriodChange(value)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors border",
            currentPeriod === value
              ? "bg-accent-primary text-text-inverse font-medium border-accent-primary shadow-sm"
              : "bg-background-secondary text-text-secondary border-border-subtle hover:bg-surface-overlay-hover hover:text-text-primary hover:border-border-default"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
