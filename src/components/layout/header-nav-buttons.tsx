/**
 * Header Navigation Buttons
 * Displays navigation icons with text labels on desktop for key features
 */

"use client";

import Link from "next/link";
import { Navigation, Heart, MapPin, Settings, User, Clapperboard } from "lucide-react";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/stores/preferences";
import { IconButton } from "@/components/ui";

interface HeaderNavButtonsProps {
  mounted: boolean;
}

// Labeled button for key features (shows text on desktop)
function LabeledNavButton({
  href,
  icon,
  label,
  isActive,
  hasIndicator,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  hasIndicator?: boolean;
}) {
  return (
    <Link href={href} className="relative">
      {/* Desktop: Icon + Label */}
      <button
        className={cn(
          "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-accent-primary/10 text-accent-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
        )}
      >
        {icon}
        <span>{label}</span>
      </button>

      {/* Mobile: Icon Only */}
      <IconButton
        variant="ghost"
        size="sm"
        icon={icon}
        label={label}
        className={cn("sm:hidden", isActive && "text-accent-primary")}
      />

      {/* Active indicator dot */}
      {hasIndicator && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent-primary rounded-full" />
      )}
    </Link>
  );
}

// Icon-only button for standard features
function IconNavButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href}>
      <IconButton variant="ghost" size="sm" icon={icon} label={label} />
    </Link>
  );
}

export function HeaderNavButtons({ mounted }: HeaderNavButtonsProps) {
  const { mapArea, useMapFiltering } = usePreferences();
  const mapIsActive = mounted && useMapFiltering && mapArea !== null;

  return (
    <div className="flex items-center gap-1">
      {/* What Can I Catch? - Key Feature with Label */}
      <LabeledNavButton
        href="/reachable"
        icon={<Navigation className="w-4 h-4 sm:w-4 sm:h-4" />}
        label="What Can I Catch?"
      />

      {/* Festivals - Key Feature with Label */}
      <LabeledNavButton
        href="/festivals"
        icon={<Clapperboard className="w-4 h-4 sm:w-4 sm:h-4" />}
        label="Festivals"
      />

      {/* Map - Key Feature with Label */}
      <LabeledNavButton
        href="/map"
        icon={<MapPin className="w-4 h-4 sm:w-4 sm:h-4" />}
        label="Map"
        isActive={mapIsActive}
        hasIndicator={mapIsActive}
      />

      {/* Watchlist - with Label */}
      <LabeledNavButton
        href="/watchlist"
        icon={<Heart className="w-4 h-4 sm:w-4 sm:h-4" />}
        label="Watchlist"
      />

      {/* Settings - Utility, Icon Only */}
      <IconNavButton
        href="/settings"
        icon={<Settings className="w-5 h-5" />}
        label="Settings"
      />

      {/* Auth UI - reserve space to prevent CLS during hydration */}
      <div className="w-8 h-8 flex items-center justify-center">
        {mounted ? (
          <>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="flex items-center justify-center w-8 h-8 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-background-hover">
                  <User className="w-5 h-5" />
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-8 h-8",
                  },
                }}
              />
            </SignedIn>
          </>
        ) : (
          // Placeholder during SSR - same size as UserButton
          <div className="w-8 h-8 rounded-full bg-background-tertiary" />
        )}</div>
    </div>
  );
}
