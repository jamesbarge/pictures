/**
 * Header Navigation Buttons
 * Displays navigation icons with text labels on desktop for key features
 * On mobile: hamburger menu with slide-out drawer
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navigation, Heart, MapPin, Settings, User, Clapperboard, Menu, X, Leaf } from "lucide-react";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/stores/preferences";

interface HeaderNavButtonsProps {
  mounted: boolean;
}

// Navigation items configuration
const NAV_ITEMS = [
  { href: "/reachable", icon: Navigation, label: "What Can I Catch?" },
  { href: "/festivals", icon: Clapperboard, label: "Festivals" },
  { href: "/seasons", icon: Leaf, label: "Seasons" },
  { href: "/map", icon: MapPin, label: "Map" },
  { href: "/watchlist", icon: Heart, label: "Watchlist" },
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

// Labeled button for key features (desktop only - shows text inline)
function DesktopNavButton({
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
      <button
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-accent-primary/10 text-accent-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
        )}
      >
        {icon}
        <span>{label}</span>
      </button>

      {/* Active indicator dot */}
      {hasIndicator && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent-primary rounded-full" />
      )}
    </Link>
  );
}

// Mobile menu drawer
function MobileMenuDrawer({
  isOpen,
  onClose,
  mounted,
  mapIsActive,
}: {
  isOpen: boolean;
  onClose: () => void;
  mounted: boolean;
  mapIsActive: boolean;
}) {
  const pathname = usePathname();
  const [shouldRender, setShouldRender] = useState(false);

  // Handle animation lifecycle
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    }
  }, [isOpen]);

  // Close on escape key and manage body scroll
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Cleanup after animation completes
  const handleTransitionEnd = () => {
    if (!isOpen) {
      setShouldRender(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-50 sm:hidden transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        onTransitionEnd={handleTransitionEnd}
        className={cn(
          "fixed top-0 right-0 h-full w-72 bg-background-primary border-l border-border-subtle z-50 sm:hidden",
          "transform transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <span className="font-display text-lg text-text-primary">Menu</span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === "/map" && mapIsActive);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors",
                  isActive
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.href === "/map" && mapIsActive && (
                  <span className="ml-auto w-2 h-2 bg-accent-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-4 my-2 h-px bg-border-subtle" />

        {/* Account Section */}
        <div className="p-4 space-y-4">
          {/* Account */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Account</span>
            {mounted ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors">
                      <User className="w-4 h-4" />
                      <span>Sign In</span>
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
              <div className="w-8 h-8 rounded-full bg-background-tertiary" />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function HeaderNavButtons({ mounted }: HeaderNavButtonsProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { mapArea, useMapFiltering } = usePreferences();
  const mapIsActive = mounted && useMapFiltering && mapArea !== null;

  return (
    <>
      {/* Desktop Navigation - hidden on mobile */}
      <div className="hidden sm:flex items-center gap-1">
        {/* What Can I Catch? */}
        <DesktopNavButton
          href="/reachable"
          icon={<Navigation className="w-4 h-4" />}
          label="What Can I Catch?"
        />

        {/* Festivals */}
        <DesktopNavButton
          href="/festivals"
          icon={<Clapperboard className="w-4 h-4" />}
          label="Festivals"
        />

        {/* Seasons */}
        <DesktopNavButton
          href="/seasons"
          icon={<Leaf className="w-4 h-4" />}
          label="Seasons"
        />

        {/* Map */}
        <DesktopNavButton
          href="/map"
          icon={<MapPin className="w-4 h-4" />}
          label="Map"
          isActive={mapIsActive}
          hasIndicator={mapIsActive}
        />

        {/* Watchlist */}
        <DesktopNavButton
          href="/watchlist"
          icon={<Heart className="w-4 h-4" />}
          label="Watchlist"
        />

        {/* Settings */}
        <DesktopNavButton
          href="/settings"
          icon={<Settings className="w-4 h-4" />}
          label="Settings"
        />

        {/* Auth UI */}
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
            <div className="w-8 h-8 rounded-full bg-background-tertiary" />
          )}
        </div>
      </div>

      {/* Mobile: Hamburger Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="sm:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
        aria-label="Open menu"
        aria-expanded={mobileMenuOpen}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Mobile Menu Drawer */}
      <MobileMenuDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        mounted={mounted}
        mapIsActive={mapIsActive}
      />
    </>
  );
}
