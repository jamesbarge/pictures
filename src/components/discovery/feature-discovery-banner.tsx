/**
 * Feature Discovery Banner
 * Highlights key features for new users, dismissible once features are visited
 */

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Navigation, X } from "lucide-react";
import { useHydrated } from "@/hooks/useHydrated";
import { useDiscovery } from "@/stores/discovery";
import { Card } from "@/components/ui/card";
import posthog from "posthog-js";

interface FeatureCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  feature: "reachable" | "map";
}

function FeatureCard({ href, icon, title, description, feature }: FeatureCardProps) {
  const handleClick = () => {
    posthog.capture("discovery_feature_clicked", { feature });
  };

  return (
    <Link href={href} onClick={handleClick} className="group block">
      <Card variant="interactive" padding="md" className="h-full">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-accent-primary/10 text-accent-primary shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-text-primary group-hover:text-accent-primary transition-colors">
              {title}
            </h3>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function FeatureDiscoveryBanner() {
  const hydrated = useHydrated();
  const shouldShow = useDiscovery((state) => state.shouldShowBanner());
  const dismissBanner = useDiscovery((state) => state.dismissBanner);
  const hasTrackedShown = useRef(false);

  // Track banner shown (only once per mount)
  useEffect(() => {
    if (hydrated && shouldShow && !hasTrackedShown.current) {
      posthog.capture("discovery_banner_shown");
      hasTrackedShown.current = true;
    }
  }, [hydrated, shouldShow]);

  const handleDismiss = () => {
    dismissBanner();
    posthog.capture("discovery_banner_dismissed");
  };

  // Don't render during SSR or if banner should be hidden
  if (!hydrated || !shouldShow) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-accent-primary/5 via-background-secondary to-accent-primary/5 border-b border-border-subtle">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-text-primary">
            Discover Features
          </span>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-background-hover text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Dismiss discovery banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feature Card */}
        <FeatureCard
          href="/reachable"
          icon={<Navigation className="w-5 h-5" />}
          title="What Can I Catch?"
          description="Find films that fit your schedule. Enter your location and deadline, and we'll show you what you can reach in time."
          feature="reachable"
        />
      </div>
    </div>
  );
}
