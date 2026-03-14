/**
 * Shared Constants
 * Central location for constants used across the application
 */

/**
 * Tiny 10x15 dark gray placeholder for blur effect during image load
 * Matches the 2:3 aspect ratio of movie posters
 */
export const POSTER_BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";

/**
 * Formats considered "special" and worth highlighting
 */
const SPECIAL_FORMATS = ["35mm", "70mm", "imax", "4k"] as const;

/**
 * Get normalized display format for special formats
 */
export function getSpecialFormat(format: string | null | undefined): string | null {
  if (!format) return null;
  const lower = format.toLowerCase();

  for (const special of SPECIAL_FORMATS) {
    if (lower.includes(special)) {
      if (lower.includes("70mm")) return "70mm";
      if (lower.includes("35mm")) return "35mm";
      if (lower.includes("imax")) return "IMAX";
      if (lower.includes("4k")) return "4K";
    }
  }
  return null;
}
