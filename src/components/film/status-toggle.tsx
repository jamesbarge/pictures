/**
 * Film Status Toggle Component
 * Allows users to mark films as want_to_see, seen, or not_interested
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff, Heart, X, Check } from "lucide-react";
import { useFilmStatus, FilmStatus } from "@/stores/film-status";
import { cn } from "@/lib/cn";

interface StatusToggleProps {
  filmId: string;
  variant?: "full" | "compact";
}

const statusConfig: Record<
  Exclude<FilmStatus, null>,
  { icon: typeof Heart; label: string; className: string; activeClassName: string }
> = {
  want_to_see: {
    icon: Heart,
    label: "Want to See",
    className: "hover:bg-pink-500/20 hover:text-pink-400 hover:border-pink-500/50",
    activeClassName: "bg-pink-500/20 text-pink-400 border-pink-500/50",
  },
  seen: {
    icon: Eye,
    label: "Seen",
    className: "hover:bg-green-500/20 hover:text-green-400 hover:border-green-500/50",
    activeClassName: "bg-green-500/20 text-green-400 border-green-500/50",
  },
  not_interested: {
    icon: EyeOff,
    label: "Not Interested",
    className: "hover:bg-gray-500/20 hover:text-gray-400 hover:border-gray-500/50",
    activeClassName: "bg-gray-500/20 text-gray-400 border-gray-500/50",
  },
};

export function StatusToggle({ filmId, variant = "full" }: StatusToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { films, setStatus } = useFilmStatus();
  const currentStatus = films[filmId]?.status ?? null;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStatusChange = (status: FilmStatus) => {
    setStatus(filmId, status);
    setIsOpen(false);
  };

  if (variant === "compact") {
    // Just show icons in a row
    return (
      <div className="flex items-center gap-1">
        {(Object.entries(statusConfig) as [Exclude<FilmStatus, null>, typeof statusConfig["want_to_see"]][]).map(
          ([status, config]) => {
            const Icon = config.icon;
            const isActive = currentStatus === status;

            return (
              <button
                key={status}
                onClick={() => handleStatusChange(isActive ? null : status)}
                className={cn(
                  "p-2 rounded-lg border border-border-default transition-all",
                  isActive ? config.activeClassName : "text-text-tertiary " + config.className
                )}
                title={config.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          }
        )}
      </div>
    );
  }

  // Full dropdown variant
  const activeConfig = currentStatus ? statusConfig[currentStatus] : null;
  const ActiveIcon = activeConfig?.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all",
          currentStatus && activeConfig
            ? activeConfig.activeClassName
            : "border-border-default text-text-secondary hover:border-border-emphasis hover:text-text-primary"
        )}
      >
        {ActiveIcon ? (
          <>
            <ActiveIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{activeConfig?.label}</span>
            <X
              className="w-3.5 h-3.5 ml-1 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(null);
              }}
            />
          </>
        ) : (
          <>
            <Heart className="w-4 h-4" />
            <span className="text-sm">Add to Watchlist</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 py-1 bg-background-secondary border border-border-default rounded-lg shadow-elevated z-50 min-w-[180px]">
          {(Object.entries(statusConfig) as [Exclude<FilmStatus, null>, typeof statusConfig["want_to_see"]][]).map(
            ([status, config]) => {
              const Icon = config.icon;
              const isActive = currentStatus === status;

              return (
                <button
                  key={status}
                  onClick={() => handleStatusChange(isActive ? null : status)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    isActive
                      ? config.activeClassName
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-overlay-hover"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-sm">{config.label}</span>
                  {isActive && <Check className="w-4 h-4" />}
                </button>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
