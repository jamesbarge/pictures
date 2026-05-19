/**
 * Special-intent tokens.
 *
 * Each entry triggers a specific filter assignment in the parser.
 * The parser handles these via direct string match against the
 * canonical key (multi-word phrases first).
 */

export const SPECIAL_TOKENS = {
  isRepertory: new Set(["rep", "repertory"]),
  hasSubtitles: new Set(["subs", "subtitled", "subtitles"]),
  isRelaxedScreening: new Set(["relaxed"]),
  isPremiere: new Set(["premiere", "premieres"]),
  reachable: new Set(["nearby", "near", "reachable"]),
  watchlist: new Set(["watchlist"]),
  seen: new Set(["seen", "watched"]),
} as const;

// Premiere subtypes — set on isPremiere=true plus premiereTypes[]
export const PREMIERE_TYPE_PHRASES: Record<string, string> = {
  "world premiere": "world",
  "uk premiere": "uk",
  "european premiere": "european",
  "international premiere": "international",
};

export const PREMIERE_PHRASES_BY_LENGTH: Record<number, string[]> = {
  2: ["world premiere", "uk premiere", "european premiere", "international premiere"],
};

// "want to see" → watchlist filter
export const WATCHLIST_PHRASES: Record<string, "want_to_see" | "seen"> = {
  "want to see": "want_to_see",
  "to watch": "want_to_see",
  "to see": "want_to_see",
};

export const WATCHLIST_PHRASES_BY_LENGTH: Record<number, string[]> = {
  3: ["want to see"],
  2: ["to watch", "to see"],
};
