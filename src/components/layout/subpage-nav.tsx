/**
 * SubpageNav — lightweight header for non-homepage routes.
 * Shows logo + HeaderNavButtons (same top bar as the main Header)
 * without the filter bar, which only applies to the calendar view.
 */

"use client";

import Link from "next/link";
import { useHydrated } from "@/hooks/useHydrated";
import { HeaderNavButtons } from "@/components/layout/header-nav-buttons";

export function SubpageNav() {
  const mounted = useHydrated();

  return (
    <header className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle shadow-sm">
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
    </header>
  );
}
