/**
 * Share Screening Button
 * Enables one-tap sharing of a specific screening via Web Share API (mobile)
 * or clipboard copy (desktop). Core word-of-mouth growth loop.
 */

"use client";

import { useState, useCallback } from "react";
import { Share2, Check } from "lucide-react";
import { format as formatDate } from "date-fns";
import { cn } from "@/lib/cn";
import { usePostHog } from "posthog-js/react";

interface ShareScreeningButtonProps {
  filmTitle: string;
  filmId: string;
  cinemaName: string;
  datetime: Date;
  screeningFormat?: string | null;
  eventType?: string | null;
  /** Compact mode for use in screening cards (icon only) */
  compact?: boolean;
  className?: string;
}

function buildShareText({
  filmTitle,
  cinemaName,
  datetime,
  screeningFormat,
  eventType,
}: Omit<ShareScreeningButtonProps, "filmId" | "compact" | "className">): string {
  const dateStr = formatDate(new Date(datetime), "EEE d MMM");
  const timeStr = formatDate(new Date(datetime), "HH:mm");

  const parts = [
    `${filmTitle} at ${cinemaName}`,
    `${dateStr}, ${timeStr}`,
  ];

  const tags: string[] = [];
  if (screeningFormat && screeningFormat !== "unknown") {
    tags.push(screeningFormat.toUpperCase());
  }
  if (eventType) {
    const eventLabels: Record<string, string> = {
      q_and_a: "Q&A",
      intro: "Intro",
      discussion: "Discussion",
      double_bill: "Double Bill",
      preview: "Preview",
      premiere: "Premiere",
    };
    tags.push(eventLabels[eventType] || eventType);
  }
  if (tags.length > 0) {
    parts.push(tags.join(" · "));
  }

  return parts.join("\n");
}

export function ShareScreeningButton({
  filmTitle,
  filmId,
  cinemaName,
  datetime,
  screeningFormat,
  eventType,
  compact = false,
  className,
}: ShareScreeningButtonProps) {
  const [copied, setCopied] = useState(false);
  const posthog = usePostHog();

  const shareUrl = `https://pictures.london/film/${filmId}`;

  const shareText = buildShareText({
    filmTitle,
    cinemaName,
    datetime,
    screeningFormat,
    eventType,
  });

  const handleShare = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      posthog.capture("screening_shared", {
        film_id: filmId,
        film_title: filmTitle,
        cinema_name: cinemaName,
        screening_time: datetime,
        format: screeningFormat,
        method: typeof navigator !== "undefined" && "share" in navigator ? "native" : "clipboard",
      });

      // Try native share (mobile)
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: `${filmTitle} at ${cinemaName}`,
            text: shareText,
            url: shareUrl,
          });
          return;
        } catch {
          // User cancelled or share failed, fall through to clipboard
        }
      }

      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API not available
      }
    },
    [filmId, filmTitle, cinemaName, datetime, screeningFormat, shareText, shareUrl, posthog]
  );

  if (compact) {
    return (
      <button
        onClick={handleShare}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-colors shadow-sm",
          copied
            ? "bg-accent-success text-white"
            : "bg-black/60 text-white/80 hover:bg-accent-primary hover:text-white",
          className
        )}
        aria-label={copied ? "Link copied" : `Share ${filmTitle} screening`}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={cn(
        "shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5",
        copied
          ? "text-accent-success bg-accent-success/10 border border-accent-success/30"
          : "text-text-secondary bg-background-tertiary hover:bg-surface-overlay-hover border border-border-subtle",
        className
      )}
      aria-label={copied ? "Link copied" : `Share ${filmTitle} screening`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
          Share
        </>
      )}
    </button>
  );
}
