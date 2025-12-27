/**
 * Title Ambiguity Detection
 *
 * Identifies film titles that are likely to have multiple TMDB matches,
 * requiring extra care during matching (director/year hints, or manual review).
 *
 * Ambiguous titles include:
 * - Very short titles (1-2 words): "Ten", "Her", "It", "Evolution"
 * - Common English words: "Crash", "The Gift", "The Room"
 * - Single-word titles: Almost always have multiple matches
 * - Year-based titles: "1917", "2001", "1984"
 * - Common name titles: "Anna", "Carol", "Michael"
 */

export interface AmbiguityScore {
  score: number; // 0-1, higher = more ambiguous
  reasons: string[]; // Why it's considered ambiguous
  requiresReview: boolean; // Should bypass auto-match if no metadata available
}

// Common English words that could be film titles
const COMMON_WORD_TITLES = new Set([
  "crash",
  "evolution",
  "her",
  "him",
  "it",
  "us",
  "them",
  "room",
  "the room",
  "gift",
  "the gift",
  "host",
  "the host",
  "drive",
  "arrival",
  "contact",
  "life",
  "heat",
  "prey",
  "taken",
  "buried",
  "flight",
  "gravity",
  "salt",
  "up",
  "brave",
  "frozen",
  "tangled",
  "raw",
  "shame",
  "click",
  "signs",
  "split",
  "run",
  "safe",
  "nine",
  "ten",
  "seven",
  "eight",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "eleven",
  "twelve",
  "thirteen",
]);

// Common first names that are also film titles
const COMMON_NAME_TITLES = new Set([
  "anna",
  "carol",
  "carrie",
  "emma",
  "frances",
  "jane",
  "julia",
  "maria",
  "mary",
  "rebecca",
  "sophie",
  "victoria",
  "alan",
  "arthur",
  "charlie",
  "david",
  "frank",
  "jack",
  "james",
  "john",
  "michael",
  "paul",
  "peter",
  "richard",
  "robert",
  "thomas",
  "william",
]);

// Year-based titles
const YEAR_TITLE_PATTERN = /^(19\d{2}|20\d{2})$/;

/**
 * Calculate ambiguity score for a film title
 *
 * @param title - The film title to analyze
 * @returns Ambiguity score with reasons and review requirement
 */
export function analyzeTitleAmbiguity(title: string): AmbiguityScore {
  const reasons: string[] = [];
  let score = 0;

  const normalized = title.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Single word titles are highly ambiguous
  if (wordCount === 1) {
    score += 0.5;
    reasons.push("Single-word title");
  } else if (wordCount === 2) {
    // Two-word titles are moderately ambiguous
    score += 0.3;
    reasons.push("Short title (2 words)");
  }

  // Very short character count (even with multiple words)
  if (normalized.length <= 5) {
    score += 0.3;
    reasons.push("Very short title (≤5 chars)");
  } else if (normalized.length <= 10) {
    score += 0.1;
    reasons.push("Short title (≤10 chars)");
  }

  // Common English word titles
  if (COMMON_WORD_TITLES.has(normalized)) {
    score += 0.4;
    reasons.push("Common English word");
  }

  // Check each word for common words
  for (const word of words) {
    if (COMMON_WORD_TITLES.has(word) && wordCount <= 2) {
      score += 0.2;
      reasons.push(`Contains common word: "${word}"`);
      break; // Only count once
    }
  }

  // Common name titles
  if (COMMON_NAME_TITLES.has(normalized)) {
    score += 0.4;
    reasons.push("Common first name");
  }

  // Check for name as first word
  if (words.length > 0 && COMMON_NAME_TITLES.has(words[0])) {
    score += 0.2;
    reasons.push(`Starts with common name: "${words[0]}"`);
  }

  // Year-based titles
  if (YEAR_TITLE_PATTERN.test(normalized)) {
    score += 0.3;
    reasons.push("Year-based title");
  }

  // Titles starting with "The" followed by single word
  if (words.length === 2 && words[0] === "the") {
    score += 0.2;
    reasons.push("'The X' pattern with single noun");
  }

  // Cap score at 1.0
  score = Math.min(score, 1.0);

  // Require review if score is high OR if it's a problematic pattern
  const requiresReview = score >= 0.5 || wordCount === 1;

  return {
    score,
    reasons: [...new Set(reasons)], // Deduplicate reasons
    requiresReview,
  };
}

/**
 * Check if a title is ambiguous enough to require metadata for matching
 *
 * @param title - The film title to check
 * @returns true if director/year should be required for matching
 */
export function isAmbiguousTitle(title: string): boolean {
  const { requiresReview } = analyzeTitleAmbiguity(title);
  return requiresReview;
}

/**
 * Check if we have sufficient metadata to confidently match an ambiguous title
 *
 * @param title - The film title
 * @param hasYear - Whether year hint is available
 * @param hasDirector - Whether director hint is available
 * @returns true if we have enough metadata to proceed with matching
 */
export function hasSufficientMetadata(
  title: string,
  hasYear: boolean,
  hasDirector: boolean
): boolean {
  const { score, requiresReview } = analyzeTitleAmbiguity(title);

  // Not ambiguous - any metadata is fine
  if (!requiresReview) {
    return true;
  }

  // Highly ambiguous - need both year and director
  if (score >= 0.8) {
    return hasYear && hasDirector;
  }

  // Moderately ambiguous - need at least year
  if (score >= 0.5) {
    return hasYear;
  }

  // Low ambiguity - proceed
  return true;
}
