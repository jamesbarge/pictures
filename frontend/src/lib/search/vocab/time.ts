/**
 * Time-of-day tokens and presets.
 *
 * Canonical values align with TIME_PRESETS in
 * `$lib/constants/filters.ts`:
 *   MORNING    0-11
 *   AFTERNOON  12-16
 *   EVENING    17-20
 *   LATE       21-23
 */

export interface TimeRange {
  from: number;
  to: number;
}

export const TIME_PRESETS: Record<string, TimeRange> = {
  morning: { from: 0, to: 11 },
  afternoon: { from: 12, to: 16 },
  evening: { from: 17, to: 20 },
  "late night": { from: 21, to: 23 },
  late: { from: 21, to: 23 },
  night: { from: 17, to: 23 },
};

export const TIME_PHRASES_BY_LENGTH: Record<number, string[]> = {
  2: ["late night"],
};
