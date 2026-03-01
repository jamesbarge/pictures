/**
 * Pictures Unified Header
 * Single filter bar with date, film search, and cinema selection
 * Uses design system primitives for consistent styling
 *
 * Subcomponents extracted to ./header/ directory for maintainability.
 */

"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import Link from "next/link";
import { HeaderNavButtons } from "@/components/layout/header-nav-buttons";
import {
  MobileFiltersButton,
  ActiveFilterChips,
  FilmTypeFilter,
  DateTimeFilter,
  FilmSearchFilter,
  CinemaFilter,
  FormatFilter,
  ViewModeToggle,
  ClearFiltersButton,
  ShareFiltersButton,
} from "./header/index";
import type { HeaderProps } from "./header/types";

export type { HeaderProps };

export function Header({ cinemas, seasons, availableFormats }: HeaderProps) {
  const mounted = useHydrated();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle shadow-sm">
      {/* Top Bar - Logo and Settings */}
      <div className="border-b border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-2">
            <span className="font-display text-2xl text-text-primary tracking-tight group-hover:text-accent-primary transition-colors">
              Pictures
            </span>
            <span className="text-text-muted/40 text-lg font-light">|</span>
            <span className="text-sm text-text-tertiary font-normal hidden sm:inline">
              London Cinema Listings
            </span>
          </Link>

          {/* Navigation Icons */}
          <HeaderNavButtons mounted={mounted} />
        </div>
      </div>

      {/* Mobile Filter Bar - Search + Filters Button */}
      <div className="sm:hidden px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Search - Always visible on mobile */}
          <div className="flex-1">
            <FilmSearchFilter mounted={mounted} />
          </div>

          {/* Filters Toggle Button */}
          <MobileFiltersButton
            isOpen={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
            mounted={mounted}
          />
        </div>

        {/* Active Filter Chips - always render container to prevent CLS */}
        <ActiveFilterChips cinemas={cinemas} seasons={seasons} mounted={mounted} />

        {/* Collapsible Filter Panel */}
        {filtersOpen && (
          <div className="mt-3 p-4 bg-background-secondary rounded-xl border border-border-subtle divide-y divide-border-subtle">
            {/* Film Type */}
            <div className="pb-4">
              <div className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Film Type
              </div>
              <FilmTypeFilter mounted={mounted} fullWidth />
            </div>

            {/* Date & Time */}
            <div className="py-4">
              <div className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                When
              </div>
              <DateTimeFilter mounted={mounted} fullWidth />
            </div>

            {/* Cinema */}
            <div className="py-4">
              <div className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Cinema
              </div>
              <CinemaFilter cinemas={cinemas} mounted={mounted} fullWidth />
            </div>

            {/* Format - only show if formats are available */}
            {availableFormats.length > 0 && (
              <div className="py-4">
                <div className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                  Projection Format
                </div>
                <FormatFilter mounted={mounted} availableFormats={availableFormats} fullWidth />
              </div>
            )}

            {/* View Mode */}
            <div className="py-4">
              <div className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                View
              </div>
              <ViewModeToggle mounted={mounted} fullWidth />
            </div>

            {/* Actions */}
            <div className="pt-4 flex gap-2">
              {mounted && <ShareFiltersButton fullWidth />}
              {mounted && <ClearFiltersButton fullWidth />}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Filter Bar - All filters visible */}
      <div className="hidden sm:block px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          {/* Film Type Filter */}
          <FilmTypeFilter mounted={mounted} />

          {/* Date Picker */}
          <DateTimeFilter mounted={mounted} />

          {/* Film Search */}
          <FilmSearchFilter mounted={mounted} />

          {/* Cinema Filter */}
          <CinemaFilter cinemas={cinemas} mounted={mounted} />

          {/* Format Filter */}
          <FormatFilter mounted={mounted} availableFormats={availableFormats} />

          {/* View Mode Toggle */}
          <ViewModeToggle mounted={mounted} />

          {/* Share & Clear */}
          {mounted && <ShareFiltersButton />}
          {mounted && <ClearFiltersButton />}
        </div>
      </div>
    </header>
  );
}
