/**
 * Reachable Page Client Component
 * Handles all interactive state for the "What Can I Catch?" feature
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { useHydrated } from "@/hooks/useHydrated";
import { useReachable, areTravelTimesFresh } from "@/stores/reachable";
import { useDiscovery } from "@/stores/discovery";
import { fetchTravelTimes, getReachableScreenings } from "@/lib/travel-time";
import { PostcodeInput } from "@/components/reachable/postcode-input";
import { DeadlinePicker } from "@/components/reachable/deadline-picker";
import { TravelModeToggle } from "@/components/reachable/travel-mode-toggle";
import { ReachableResults } from "@/components/reachable/reachable-results";
import type { CinemaCoordinates } from "@/types/cinema";

interface Screening {
  id: string;
  datetime: Date;
  format: string | null;
  screen: string | null;
  eventType: string | null;
  eventDescription: string | null;
  isSpecialEvent: boolean;
  bookingUrl: string | null;
  film: {
    id: string;
    title: string;
    year: number | null;
    directors: string[] | null;
    posterUrl: string | null;
    runtime: number | null;
    isRepertory: boolean;
  };
  cinema: {
    id: string;
    name: string;
    shortName: string | null;
  };
}

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  coordinates: CinemaCoordinates | null;
}

interface ReachablePageClientProps {
  screenings: Screening[];
  cinemas: Cinema[];
}

export function ReachablePageClient({
  screenings,
  cinemas,
}: ReachablePageClientProps) {
  const hydrated = useHydrated();

  // Store state
  const {
    postcode,
    coordinates,
    finishedByTime,
    travelMode,
    travelTimes,
    lastCalculatedAt,
    isCalculating,
    error,
    setPostcode,
    setCoordinates,
    setFinishedByTime,
    setTravelMode,
    setTravelTimes,
    setCalculating,
    setError,
    hasValidInputs,
  } = useReachable();

  // Local state for input validation
  const [postcodeError, setPostcodeError] = useState<string | null>(null);

  // Track that user has visited this feature (for discovery banner)
  useEffect(() => {
    useDiscovery.getState().markFeatureVisited("reachable");
  }, []);

  // Check if we need to recalculate travel times
  const needsCalculation =
    coordinates &&
    finishedByTime &&
    (!lastCalculatedAt || !areTravelTimesFresh(lastCalculatedAt));

  // Calculate travel times when inputs are valid and cache is stale
  const calculateTimes = useCallback(async () => {
    if (!coordinates || isCalculating) return;

    setCalculating(true);
    setError(null);

    try {
      const times = await fetchTravelTimes(
        coordinates,
        cinemas.map((c) => ({
          id: c.id,
          coordinates: c.coordinates,
        })),
        travelMode
      );
      setTravelTimes(times);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to calculate travel times"
      );
    }
  }, [coordinates, travelMode, cinemas, isCalculating, setCalculating, setError, setTravelTimes]);

  // Auto-calculate when conditions are met
  useEffect(() => {
    if (hydrated && needsCalculation && !isCalculating) {
      calculateTimes();
    }
  }, [hydrated, needsCalculation, isCalculating, calculateTimes]);

  // Filter screenings based on reachability
  const reachableScreenings =
    hydrated && coordinates && finishedByTime && Object.keys(travelTimes).length > 0
      ? getReachableScreenings(
          screenings.map((s) => ({
            id: s.id,
            datetime: s.datetime.toISOString(),
            format: s.format,
            bookingUrl: s.bookingUrl,
            cinema: s.cinema,
            film: {
              id: s.film.id,
              title: s.film.title,
              year: s.film.year,
              runtime: s.film.runtime,
              posterUrl: s.film.posterUrl,
            },
          })),
          travelTimes,
          finishedByTime
        )
      : [];

  // Show setup UI if inputs aren't complete
  const showSetup = !coordinates || !finishedByTime;

  return (
    <div className="min-h-screen bg-background-primary flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-display text-lg">What Can I Catch?</span>
          </Link>

          {/* Status indicator - reserve space to prevent CLS */}
          <div className="flex items-center gap-2 text-sm text-text-secondary min-w-[80px] justify-end">
            {hydrated && coordinates && (
              <>
                <MapPin className="w-4 h-4 text-accent-primary" />
                <span className="hidden sm:inline">{postcode}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Hero / Explainer Section */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-display text-text-primary mb-2">
              Find films that fit your schedule
            </h1>
            <p className="text-text-secondary text-sm sm:text-base">
              Tell us where you are and when you need to be free. We&apos;ll
              calculate travel times to {cinemas.length} London cinemas and show
              you every screening you can catch.
            </p>
          </div>

          {/* Input Section */}
          <div className="space-y-6 mb-8">
            {/* Postcode Input */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Your location
              </label>
              <PostcodeInput
                value={hydrated ? postcode : ""}
                onChange={(value, coords, error) => {
                  setPostcode(value);
                  setCoordinates(coords);
                  setPostcodeError(error || null);
                }}
                error={postcodeError}
              />
            </div>

            {/* Deadline Picker */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                I need to be free by
              </label>
              <DeadlinePicker
                value={hydrated ? finishedByTime : null}
                onChange={setFinishedByTime}
              />
            </div>

            {/* Travel Mode */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                How are you travelling?
              </label>
              <TravelModeToggle
                value={hydrated ? travelMode : "transit"}
                onChange={setTravelMode}
              />
            </div>
          </div>

          {/* Status Messages */}
          {hydrated && (
            <>
              {/* Error State */}
              {error && (
                <div className="mb-6 p-4 bg-error-surface border border-error-border rounded-lg">
                  <p className="text-sm text-error-text">{error}</p>
                  <button
                    onClick={calculateTimes}
                    className="mt-2 text-sm text-error-text underline hover:no-underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Loading State */}
              {isCalculating && (
                <div className="mb-6 p-6 bg-background-secondary border border-border-subtle rounded-lg flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                  <span className="text-text-secondary">
                    Calculating travel times to {cinemas.length} cinemas...
                  </span>
                </div>
              )}

            </>
          )}

          {/* Results */}
          {hydrated && !showSetup && !isCalculating && !error && (
            <ReachableResults
              screenings={reachableScreenings}
              totalScreenings={screenings.length}
              finishedByTime={finishedByTime!}
            />
          )}
        </div>
      </main>

      {/* Footer Stats - always render container to prevent CLS */}
      <footer className="sticky bottom-0 bg-background-primary border-t border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-sm min-h-[44px]">
          {hydrated && !showSetup && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-text-primary font-medium">
                  {reachableScreenings.length}
                </span>
                <span className="text-text-secondary">
                  screenings you can catch
                </span>
              </div>
              {Object.keys(travelTimes).length > 0 && (
                <div className="text-text-tertiary">
                  {Object.keys(travelTimes).length} cinemas reachable
                </div>
              )}
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
