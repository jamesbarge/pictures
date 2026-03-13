/**
 * useSafeDateLabels Hook
 *
 * Provides SSR-safe date comparison functions that prevent hydration mismatches.
 *
 * Problem: date-fns functions like isToday() and isTomorrow() internally call
 * new Date() to get "now". During SSR, "now" is server time. During hydration,
 * "now" is client time. If these differ (e.g., near midnight, different timezones),
 * the rendered output differs, causing React hydration errors.
 *
 * Solution: These wrapper functions only return true AFTER hydration completes.
 * During SSR and initial hydration, they return false, so components render
 * the full date format. After hydration, they return the actual result,
 * allowing React's normal update cycle to show "Today/Tomorrow" labels.
 *
 * Usage:
 *   const { isClientToday, isClientTomorrow, isClientThisWeek } = useSafeDateLabels();
 *
 *   // This is safe - returns false during SSR, actual value after hydration
 *   if (isClientToday(date)) return "Today";
 *   return format(date, "EEEE d MMMM");
 */

import { useCallback } from "react";
import { isToday, isTomorrow, isThisWeek, isSameDay, startOfDay } from "date-fns";
import { useHydrated } from "./useHydrated";

interface SafeDateLabels {
  /** Returns true only after hydration if the date is today */
  isClientToday: (date: Date) => boolean;
  /** Returns true only after hydration if the date is tomorrow */
  isClientTomorrow: (date: Date) => boolean;
  /** Returns true only after hydration if the date is this week */
  isClientThisWeek: (date: Date) => boolean;
  /** Returns true only after hydration if two dates are the same day */
  isClientSameDay: (dateA: Date, dateB: Date) => boolean;
  /** Returns today's date only after hydration, null during SSR */
  clientToday: Date | null;
  /** Whether hydration is complete */
  hydrated: boolean;
}

/** SSR-safe date comparison functions that only return true after hydration to prevent mismatch. */
export function useSafeDateLabels(): SafeDateLabels {
  const hydrated = useHydrated();

  const isClientToday = useCallback(
    (date: Date): boolean => {
      if (!hydrated) return false;
      return isToday(date);
    },
    [hydrated]
  );

  const isClientTomorrow = useCallback(
    (date: Date): boolean => {
      if (!hydrated) return false;
      return isTomorrow(date);
    },
    [hydrated]
  );

  const isClientThisWeek = useCallback(
    (date: Date): boolean => {
      if (!hydrated) return false;
      return isThisWeek(date, { weekStartsOn: 1 }); // Week starts Monday
    },
    [hydrated]
  );

  const isClientSameDay = useCallback(
    (dateA: Date, dateB: Date): boolean => {
      if (!hydrated) return false;
      return isSameDay(dateA, dateB);
    },
    [hydrated]
  );

  // Provide current date only after hydration
  const clientToday = hydrated ? startOfDay(new Date()) : null;

  return {
    isClientToday,
    isClientTomorrow,
    isClientThisWeek,
    isClientSameDay,
    clientToday,
    hydrated,
  };
}
