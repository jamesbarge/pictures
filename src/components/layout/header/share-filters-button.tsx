"use client";

import { useState } from "react";
import { Share2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";
import { Button } from "@/components/ui";
import { useUrlFilters } from "@/hooks/useUrlFilters";

/** Share Filters Button - copies shareable URL to clipboard */
export function ShareFiltersButton({ fullWidth }: { fullWidth?: boolean } = {}) {
  const [copied, setCopied] = useState(false);
  const { copyShareableUrl } = useUrlFilters();
  const filters = useFilters();

  // Calculate filter count (same logic as ClearFiltersButton)
  const count =
    (filters.filmSearch.trim() ? 1 : 0) +
    (filters.cinemaIds.length > 0 ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.timeFrom !== null || filters.timeTo !== null ? 1 : 0) +
    filters.formats.length +
    filters.programmingTypes.length +
    filters.decades.length +
    filters.genres.length +
    filters.timesOfDay.length +
    (filters.festivalSlug ? 1 : 0) +
    (filters.festivalOnly ? 1 : 0) +
    (filters.seasonSlug ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.onlySingleShowings ? 1 : 0);

  // Don't show if no filters are active
  if (count === 0) return null;

  const handleShare = async () => {
    const success = await copyShareableUrl();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      leftIcon={copied ? <CheckCircle className="w-4 h-4 text-accent-success" /> : <Share2 className="w-4 h-4" />}
      className={cn(
        fullWidth ? "w-full justify-center" : undefined,
        copied && "text-accent-success"
      )}
    >
      {copied ? "Copied!" : "Share"}
    </Button>
  );
}
