/**
 * Shared utility functions for header filter components
 */

import { startOfToday, addDays } from "date-fns";

/** Get the next Saturday (or today if it is Saturday) */
export function getNextWeekend(): Date {
  const today = startOfToday();
  const dayOfWeek = today.getDay();
  // Saturday = 6, Sunday = 0
  const daysUntilSaturday = dayOfWeek === 0 ? 6 : dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  return addDays(today, daysUntilSaturday);
}
