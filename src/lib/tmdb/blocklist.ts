/**
 * TMDB Blocklist
 * Loads known wrong TMDB matches from structured learnings JSON.
 * Used by findBestMatch() to filter out known-bad candidates and inject known-good ones.
 */

import * as fs from "fs";
import * as path from "path";

interface WrongMatch {
  wrong: number;
  correct: number;
  year: number;
  usedCount: number;
}

interface BlocklistEntry {
  wrongId: number;
  correctId: number;
  year: number;
}

// Cache the blocklist in memory
let blocklistCache: Map<string, BlocklistEntry> | null = null;
let wrongIdIndex: Map<number, BlocklistEntry> | null = null;

function normalizeForBlocklist(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Strip common prefixes
    .replace(/^(film club|doc'n roll x rio|funeral parade presents|screen cuba presents|classic matinee|lost reels|classics night|japanese film club|tv party, tonight!|lafs presents|east london doc club):\s*/i, "")
    // Strip common suffixes
    .replace(/\s*\+\s*(q&a|extended intro|pre-recorded intro|intro|discussion|panel)\s*$/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[""''""]/g, "")
    .trim();
}

function loadBlocklist(): void {
  if (blocklistCache && wrongIdIndex) return;

  blocklistCache = new Map();
  wrongIdIndex = new Map();

  const jsonPath = path.resolve(process.cwd(), ".claude/data-check-learnings.json");
  if (!fs.existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const matches: Record<string, WrongMatch> = data.wrongTmdbMatches || {};

    for (const [title, match] of Object.entries(matches)) {
      const entry: BlocklistEntry = {
        wrongId: match.wrong,
        correctId: match.correct,
        year: match.year,
      };
      blocklistCache.set(title, entry);
      wrongIdIndex.set(match.wrong, entry);
    }
  } catch {
    // If JSON is malformed, proceed with empty blocklist
  }
}

/**
 * Check if a TMDB ID is in the blocklist (known wrong match).
 * Returns the blocklist entry if found, null otherwise.
 */
export function checkBlocklist(tmdbId: number): BlocklistEntry | null {
  loadBlocklist();
  return wrongIdIndex?.get(tmdbId) ?? null;
}

/**
 * Check if a film title has a known wrong match.
 * Uses normalized title matching.
 */
export function checkTitleBlocklist(title: string): BlocklistEntry | null {
  loadBlocklist();
  const normalized = normalizeForBlocklist(title);
  return blocklistCache?.get(normalized) ?? null;
}

/**
 * Get all blocked TMDB IDs (for filtering search results).
 */
export function getBlockedTmdbIds(): Set<number> {
  loadBlocklist();
  const ids = new Set<number>();
  if (wrongIdIndex) {
    wrongIdIndex.forEach((_, id) => ids.add(id));
  }
  return ids;
}

/**
 * Increment the usage count for a blocklist entry in the learnings JSON.
 * Called when a blocklist entry is actually used to filter a match.
 */
export function incrementBlocklistUsage(title: string): void {
  const jsonPath = path.resolve(process.cwd(), ".claude/data-check-learnings.json");
  if (!fs.existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const normalized = normalizeForBlocklist(title);
    if (data.wrongTmdbMatches?.[normalized]) {
      data.wrongTmdbMatches[normalized].usedCount += 1;
      data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
    }
  } catch {
    // Don't crash on write failure
  }
}

/**
 * Reset the cached blocklist (for testing or after JSON updates).
 */
export function resetBlocklistCache(): void {
  blocklistCache = null;
  wrongIdIndex = null;
}
