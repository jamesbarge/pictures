/**
 * Letterboxd Rating Reveal Component
 *
 * A delightful cinema-themed interaction that reveals the Letterboxd rating
 * through parting theater curtains. Rating is hidden by default to respect
 * users who prefer not to see ratings before watching a film.
 *
 * Features:
 * - Theatrical curtain animation using CSS transforms
 * - Letterboxd-branded colors for authenticity
 * - Responsive star display with half-star precision
 * - Remembers reveal state per film for the session
 */

"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";

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

  const [isAnimating, setIsAnimating] = useState(false);

  const handleReveal = useCallback(() => {
    if (isRevealed || isAnimating) return;

    setIsAnimating(true);

    // Small delay for the curtain animation to complete
    setTimeout(() => {
      setIsRevealed(true);
      setIsAnimating(false);
      // Remember for this session
      if (typeof window !== "undefined") {
        sessionStorage.setItem(getRevealedKey(filmId), "true");
      }
    }, 600);
  }, [isRevealed, isAnimating, filmId]);

  // Generate star display
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.25 && rating % 1 < 0.75;
  const roundedUp = rating % 1 >= 0.75;
  const displayStars = roundedUp ? fullStars + 1 : fullStars;
  const emptyStars = 5 - displayStars - (hasHalfStar ? 1 : 0);

  return (
    <div className={cn("relative inline-flex", className)}>
      {/* The reveal button / curtain container */}
      <button
        onClick={handleReveal}
        disabled={isRevealed}
        className={cn(
          "relative overflow-hidden rounded-lg transition-all",
          "focus:outline-none focus:ring-2 focus:ring-accent-primary/40",
          isRevealed
            ? "cursor-default bg-[#1a1a1a]/95 px-3 py-1.5"
            : "cursor-pointer hover:scale-[1.02] active:scale-[0.98] px-4 py-2"
        )}
        aria-label={isRevealed ? `Letterboxd rating: ${rating.toFixed(1)} out of 5` : "Reveal Letterboxd rating"}
      >
        {/* Curtain backdrop (dark theater) */}
        {!isRevealed && (
          <div className="absolute inset-0 bg-[#1a1a1a]" />
        )}

        {/* Left curtain */}
        <div
          className={cn(
            "absolute top-0 bottom-0 left-0 w-1/2 z-10",
            "bg-gradient-to-r from-[#6B1E28] via-[#8B2E3B] to-[#7A2632]",
            "shadow-[inset_-8px_0_16px_rgba(0,0,0,0.3)]",
            "transition-transform duration-500",
            (isAnimating || isRevealed) ? "-translate-x-full" : "translate-x-0"
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          }}
        >
          {/* Curtain fold texture */}
          <div className="absolute inset-0 opacity-30">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-white/20 via-transparent to-white/10"
                style={{ left: `${25 + i * 25}%` }}
              />
            ))}
          </div>
          {/* Gold trim on edge */}
          <div className="absolute top-0 bottom-0 right-0 w-1 bg-gradient-to-b from-[#D4AF37] via-[#C9A96E] to-[#D4AF37] opacity-60" />
        </div>

        {/* Right curtain */}
        <div
          className={cn(
            "absolute top-0 bottom-0 right-0 w-1/2 z-10",
            "bg-gradient-to-l from-[#6B1E28] via-[#8B2E3B] to-[#7A2632]",
            "shadow-[inset_8px_0_16px_rgba(0,0,0,0.3)]",
            "transition-transform duration-500",
            (isAnimating || isRevealed) ? "translate-x-full" : "translate-x-0"
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          }}
        >
          {/* Curtain fold texture */}
          <div className="absolute inset-0 opacity-30">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-white/20 via-transparent to-white/10"
                style={{ right: `${25 + i * 25}%` }}
              />
            ))}
          </div>
          {/* Gold trim on edge */}
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-[#D4AF37] via-[#C9A96E] to-[#D4AF37] opacity-60" />
        </div>

        {/* Content behind curtains */}
        <div
          className={cn(
            "relative z-0 flex items-center gap-2 transition-all duration-500",
            isRevealed
              ? "opacity-100 scale-100"
              : "opacity-0 scale-90"
          )}
          style={{
            transitionDelay: isRevealed ? "200ms" : "0ms",
          }}
        >
          {/* Stars */}
          <div className="flex items-center gap-0.5">
            {/* Full stars */}
            {[...Array(displayStars)].map((_, i) => (
              <StarIcon
                key={`full-${i}`}
                filled
                className="w-4 h-4"
                style={{
                  animationDelay: isRevealed ? `${400 + i * 80}ms` : "0ms",
                }}
                animate={isRevealed}
              />
            ))}
            {/* Half star */}
            {hasHalfStar && (
              <HalfStarIcon
                className="w-4 h-4"
                style={{
                  animationDelay: isRevealed ? `${400 + displayStars * 80}ms` : "0ms",
                }}
                animate={isRevealed}
              />
            )}
            {/* Empty stars */}
            {[...Array(emptyStars)].map((_, i) => (
              <StarIcon
                key={`empty-${i}`}
                filled={false}
                className="w-4 h-4"
              />
            ))}
          </div>
          {/* Numeric rating */}
          <span
            className={cn(
              "text-sm font-medium tabular-nums transition-all",
              isRevealed && "animate-pulse"
            )}
            style={{
              color: LETTERBOXD_GREEN,
              animationDuration: "1s",
              animationIterationCount: "1",
            }}
          >
            {rating.toFixed(1)}
          </span>
        </div>

        {/* "Peek at rating" text when curtains closed */}
        {!isRevealed && !isAnimating && (
          <span className="relative z-20 text-sm font-medium text-[#F5E6C8] flex items-center gap-2">
            <span className="text-base" role="img" aria-hidden="true">🎭</span>
            Peek at rating
          </span>
        )}
      </button>
    </div>
  );
}

// Star SVG components for the rating display
function StarIcon({
  filled,
  className,
  style,
  animate
}: {
  filled: boolean;
  className?: string;
  style?: React.CSSProperties;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        className,
        animate && filled && "animate-star-pop"
      )}
      style={style}
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

function HalfStarIcon({
  className,
  style,
  animate
}: {
  className?: string;
  style?: React.CSSProperties;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(className, animate && "animate-star-pop")}
      style={style}
    >
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
