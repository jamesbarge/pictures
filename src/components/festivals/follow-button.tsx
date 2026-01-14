"use client";

/**
 * FollowButton Component
 * Button to follow/unfollow a festival with optimistic updates
 * Syncs to database when user is signed in
 */

import { useState } from "react";
import { useAuth } from "@/hooks/useClerkSafe";
import { Button } from "@/components/ui/button";
import { useFestivalStore } from "@/stores/festival";
import { useHydrated } from "@/hooks/useHydrated";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface FollowButtonProps {
  festivalId: string;
  festivalName: string;
  festivalSlug: string;
  isFollowing?: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

export function FollowButton({
  festivalId,
  festivalName,
  festivalSlug,
  isFollowing: initialIsFollowing = false,
  size = "sm",
  showLabel = true,
  className,
}: FollowButtonProps) {
  const { isSignedIn } = useAuth();
  const mounted = useHydrated();
  const {
    followFestival,
    unfollowFestival,
    isFollowing: checkIsFollowing,
    getFollow,
  } = useFestivalStore();

  // Use store state after hydration, falling back to server state
  // This prevents CLS when Zustand hydrates from localStorage
  const storeIsFollowing = mounted ? checkIsFollowing(festivalId) : false;
  const isFollowing = storeIsFollowing || initialIsFollowing;
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation when inside a Link
    e.stopPropagation();

    setIsLoading(true);

    // Optimistic update to local store
    const wasFollowing = isFollowing;

    try {
      if (wasFollowing) {
        // Optimistic unfollow
        unfollowFestival(festivalId);

        // Sync to database if signed in
        if (isSignedIn) {
          const response = await fetch(
            `/api/user/festivals/follows/${festivalId}`,
            { method: "DELETE" }
          );

          if (!response.ok) {
            // Revert on failure
            const follow = getFollow(festivalId);
            followFestival({
              id: festivalId,
              name: festivalName,
              slug: festivalSlug,
              interestLevel: follow?.interestLevel,
              notifyOnSale: follow?.notifyOnSale,
              notifyProgramme: follow?.notifyProgramme,
              notifyReminders: follow?.notifyReminders,
            });
            console.error("Failed to unfollow festival");
          }
        }
      } else {
        // Optimistic follow
        followFestival({
          id: festivalId,
          name: festivalName,
          slug: festivalSlug,
        });

        // Sync to database if signed in
        if (isSignedIn) {
          const response = await fetch(
            `/api/user/festivals/follows/${festivalId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                interestLevel: "following",
                notifyOnSale: true,
                notifyProgramme: true,
                notifyReminders: true,
              }),
            }
          );

          if (!response.ok) {
            // Revert on failure
            unfollowFestival(festivalId);
            console.error("Failed to follow festival");
          }
        }
      }
    } catch (error) {
      // Revert on network error
      if (wasFollowing) {
        followFestival({
          id: festivalId,
          name: festivalName,
          slug: festivalSlug,
        });
      } else {
        unfollowFestival(festivalId);
      }
      console.error("Network error:", error);
    } finally {
      // Small delay for visual feedback
      setTimeout(() => setIsLoading(false), 300);
    }
  };

  if (isFollowing) {
    return (
      <Button
        variant="secondary"
        size={size}
        onClick={handleClick}
        isLoading={isLoading}
        leftIcon={<Check className="w-4 h-4" />}
        className={cn("group", className)}
      >
        {showLabel && (
          <>
            <span className="group-hover:hidden">Following</span>
            <span className="hidden group-hover:inline text-accent-danger">
              Unfollow
            </span>
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="gold"
      size={size}
      onClick={handleClick}
      isLoading={isLoading}
      leftIcon={<Bell className="w-4 h-4" />}
      className={className}
    >
      {showLabel && "Follow"}
    </Button>
  );
}

// Compact version for list items
export function FollowButtonCompact({
  festivalId,
  festivalName,
  festivalSlug,
  isFollowing: initialIsFollowing = false,
}: FollowButtonProps) {
  return (
    <FollowButton
      festivalId={festivalId}
      festivalName={festivalName}
      festivalSlug={festivalSlug}
      isFollowing={initialIsFollowing}
      size="sm"
      showLabel={false}
    />
  );
}
