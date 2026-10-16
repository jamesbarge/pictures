/**
 * Filter Constants
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "late_night";
export type ProgrammingType = "repertory" | "new_release" | "special_event" | "preview";

/** Screening format options (35mm, IMAX, etc.) with display labels */
export const FORMAT_OPTIONS = [
  { value: "35mm", label: "35mm" },
  { value: "70mm", label: "70mm" },
  { value: "70mm_imax", label: "70mm IMAX" },
  { value: "imax", label: "IMAX" },
  { value: "imax_laser", label: "IMAX Laser" },
  { value: "dolby_cinema", label: "Dolby Cinema" },
] as const;
