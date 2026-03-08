/**
 * Title normalization for QA comparison.
 * Mirrors the normalizeTitle() logic from src/lib/tmdb/match.ts
 */

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*:\s*.*$/, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\w\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
