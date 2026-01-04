/**
 * Letterboxd Rating Reveal Component
 *
 * A simple button that reveals the Letterboxd rating on click.
 * Rating is hidden by default to respect users who prefer not
 * to see ratings before watching a film.
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Eye } from "lucide-react";

interface LetterboxdRatingRevealProps {
  rating: number; // 0-5 scale
  filmId: string;
  className?: string;
}

// Letterboxd brand colors
const LETTERBOXD_GREEN = "#00E054";
const LETTERBOXD_ORANGE = "#FF8000";

// Use session storage to remember which ratings have been revealed
const getRevealedKey = (filmId: string) => `letterboxd-revealed-${filmId}`;

export function LetterboxdRatingReveal({
  rating,
  filmId,
  className
}: LetterboxdRatingRevealProps) {
  // Check if this rating was already revealed in this session
  const [isRevealed, setIsRevealed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(getRevealedKey(filmId)) === "true";
  });

  const handleReveal = () => {
    if (isRevealed) return;
    setIsRevealed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(getRevealedKey(filmId), "true");
    }
  };

  // Generate star display
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.25 && rating % 1 < 0.75;
  const roundedUp = rating % 1 >= 0.75;
  const displayStars = roundedUp ? fullStars + 1 : fullStars;
  const emptyStars = 5 - displayStars - (hasHalfStar ? 1 : 0);

  if (isRevealed) {
    // Show the rating inline
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
          "text-sm",
          "bg-background-tertiary",
          "border border-border-subtle",
          className
        )}
      >
        {/* Stars */}
        <div className="flex items-center gap-0.5">
          {[...Array(displayStars)].map((_, i) => (
            <StarIcon key={`full-${i}`} filled className="w-3.5 h-3.5" />
          ))}
          {hasHalfStar && <HalfStarIcon className="w-3.5 h-3.5" />}
          {[...Array(emptyStars)].map((_, i) => (
            <StarIcon key={`empty-${i}`} filled={false} className="w-3.5 h-3.5" />
          ))}
        </div>
        {/* Numeric rating */}
        <span
          className="font-medium tabular-nums"
          style={{ color: LETTERBOXD_GREEN }}
        >
          {rating.toFixed(1)}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleReveal}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
        "text-sm text-text-tertiary hover:text-text-primary",
        "bg-background-tertiary hover:bg-surface-overlay-hover",
        "border border-border-subtle hover:border-border-default",
        "transition-all cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-accent-primary/40",
        className
      )}
      aria-label="Show Letterboxd rating"
    >
      <Eye className="w-3.5 h-3.5" />
      <span className="font-medium">Show rating</span>
    </button>
  );
}

// Star SVG components
function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? LETTERBOXD_ORANGE : "transparent"}
      stroke={filled ? LETTERBOXD_ORANGE : "#666"}
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function HalfStarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="halfStarGradient">
          <stop offset="50%" stopColor={LETTERBOXD_ORANGE} />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        fill="url(#halfStarGradient)"
        stroke={LETTERBOXD_ORANGE}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}
