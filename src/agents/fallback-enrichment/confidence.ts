/**
 * Confidence Scoring for Fallback Enrichment
 *
 * Evaluates how likely the extracted data is correct by comparing
 * multiple signals: title similarity, year confirmation, and source agreement.
 */

/**
 * Input data for confidence scoring
 */
export interface ConfidenceInput {
  /** Original film title from our database */
  originalTitle: string;
  /** Year from our database (may be null) */
  originalYear: number | null;
  /** Title found by the web search / AI extraction */
  extractedTitle: string;
  /** Year extracted from web results */
  extractedYear: number | null;
  /** Number of independent sources that agree on core data */
  sourceCount: number;
  /** Whether a poster image was found */
  hasPoster: boolean;
  /** Whether synopsis was found */
  hasSynopsis: boolean;
  /** Whether Letterboxd data was found */
  hasLetterboxd: boolean;
  /** Whether IMDb ID was found */
  hasImdb: boolean;
}

/**
 * Confidence scoring result
 */
export interface ConfidenceResult {
  score: number; // 0-1
  breakdown: {
    titleMatch: number;
    yearMatch: number;
    sourceAgreement: number;
    dataCompleteness: number;
  };
  shouldAutoApply: boolean;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize a film title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate title similarity (0-1)
 */
export function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  // Exact match after normalization
  if (normA === normB) return 1.0;

  // One contains the other
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return 0.8 + (shorter / longer) * 0.2;
  }

  // Levenshtein-based similarity
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Calculate confidence score for extracted film data
 *
 * Weights:
 * - Title match: 40% (most important signal)
 * - Year match: 25% (strong confirmation)
 * - Source agreement: 20% (multiple sources = more reliable)
 * - Data completeness: 15% (more data = more likely correct)
 */
export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  // Title match (0-1, weight: 40%)
  const titleMatch = titleSimilarity(input.originalTitle, input.extractedTitle);

  // Year match (0-1, weight: 25%)
  let yearMatch = 0.5; // Default if we can't compare
  if (input.originalYear && input.extractedYear) {
    const diff = Math.abs(input.originalYear - input.extractedYear);
    if (diff === 0) yearMatch = 1.0;
    else if (diff === 1) yearMatch = 0.8; // Off by one year is common
    else if (diff <= 2) yearMatch = 0.4;
    else yearMatch = 0.0;
  } else if (input.extractedYear) {
    // We have extracted year but not original - partial credit
    yearMatch = 0.6;
  }

  // Source agreement (0-1, weight: 20%)
  // 1 source = 0.3, 2 sources = 0.6, 3+ = 1.0
  const sourceAgreement = Math.min(1.0, input.sourceCount * 0.33);

  // Data completeness (0-1, weight: 15%)
  let completenessScore = 0;
  if (input.hasPoster) completenessScore += 0.3;
  if (input.hasSynopsis) completenessScore += 0.3;
  if (input.hasLetterboxd) completenessScore += 0.2;
  if (input.hasImdb) completenessScore += 0.2;

  // Weighted combination
  const score =
    titleMatch * 0.4 +
    yearMatch * 0.25 +
    sourceAgreement * 0.2 +
    completenessScore * 0.15;

  // Clamp to 0-1
  const finalScore = Math.max(0, Math.min(1, score));

  return {
    score: Math.round(finalScore * 100) / 100,
    breakdown: {
      titleMatch: Math.round(titleMatch * 100) / 100,
      yearMatch: Math.round(yearMatch * 100) / 100,
      sourceAgreement: Math.round(sourceAgreement * 100) / 100,
      dataCompleteness: Math.round(completenessScore * 100) / 100,
    },
    shouldAutoApply: finalScore > 0.8,
  };
}
