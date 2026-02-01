/**
 * Type definitions for the Claude Agent SDK integration
 */

// Confidence levels for agent decisions
export type ConfidenceLevel = "high" | "medium" | "low";

// Link verification status
export type LinkStatus =
  | "verified" // Link works and matches expected content
  | "broken" // 404, timeout, or error
  | "redirect" // Redirects to different page
  | "sold_out" // Valid but marked as sold out
  | "wrong_film" // Links to different film
  | "unchecked"; // Not yet verified

// Data issue types flagged by agents
export type DataIssueType =
  | "broken_link"
  | "wrong_time"
  | "duplicate_film"
  | "duplicate_screening"
  | "missing_metadata"
  | "scraper_anomaly"
  | "tmdb_mismatch";

// Severity levels for issues
export type IssueSeverity = "critical" | "warning" | "info";

// Issue status for tracking resolution
export type IssueStatus = "open" | "auto_fixed" | "manually_fixed" | "ignored";

/**
 * Data issue record created by agents
 */
export interface DataIssue {
  id: string;
  type: DataIssueType;
  severity: IssueSeverity;
  entityType: "screening" | "film" | "cinema";
  entityId: string;
  description: string;
  suggestedFix?: string;
  confidence: number; // 0-1 scale
  status: IssueStatus;
  detectedAt: Date;
  resolvedAt?: Date;
  agentName: string;
}

/**
 * Link verification result
 */
export interface LinkVerificationResult {
  screeningId: string;
  url: string;
  status: LinkStatus;
  httpStatus?: number;
  responseTime?: number;
  detectedFilmTitle?: string;
  confidence: number;
  checkedAt: Date;
  error?: string;
}

/**
 * Scraper health report from health monitor agent
 */
export interface ScraperHealthReport {
  cinemaId: string;
  cinemaName: string;
  scrapedAt: Date;
  screeningCount: number;
  averageCountLast7Days: number;
  percentChange: number;
  anomalyScore: number; // 0-1, higher = more anomalous
  anomalyDetected: boolean;
  warnings: string[];
  shouldBlockScrape: boolean;
  recommendation: string;
}

/**
 * TMDB match result from enrichment agent
 */
export interface TmdbMatchResult {
  filmId: string;
  originalTitle: string;
  tmdbId: number;
  matchedTitle: string;
  confidence: number;
  matchStrategy:
    | "exact"
    | "fuzzy"
    | "extracted"  // Title extracted from event wrapper
    | "year_adjusted"
    | "director_search"
    | "agent"  // AI suggested alternative title
    | "embedding_similarity"
    | "web-search-agent";  // Fallback enrichment via web search
  shouldAutoApply: boolean;
}

/**
 * Duplicate detection result
 */
export interface DuplicateDetectionResult {
  primaryFilmId: string;
  duplicateFilmIds: string[];
  similarity: number;
  mergeRecommendation: "auto_merge" | "review" | "keep_separate";
  evidence: string;
}

/**
 * Agent execution result
 */
export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed: number;
  executionTimeMs: number;
  agentName: string;
  timestamp: Date;
}

/**
 * Configuration for running agents
 */
export interface AgentConfig {
  model: "claude-sonnet-4-20250514" | "claude-opus-4-5-20251101" | "claude-3-5-haiku-20241022";
  maxTurns: number;
  maxTokens: number;
  enableAutoFix: boolean; // Whether to auto-fix issues or just flag
  confidenceThreshold: number; // Minimum confidence for auto-fix (0-1)
}

/**
 * Default agent configurations
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: "claude-sonnet-4-20250514",
  maxTurns: 20,
  maxTokens: 4096,
  enableAutoFix: true, // Aggressive mode
  confidenceThreshold: 0.5, // Low threshold for aggressive mode
};

/**
 * Agent-specific configurations
 */
export const AGENT_CONFIGS = {
  linkVerification: {
    ...DEFAULT_AGENT_CONFIG,
    model: "claude-3-5-haiku-20241022" as const, // Fast model for bulk verification
    maxTurns: 10,
    confidenceThreshold: 0.7,
  },
  scraperHealth: {
    ...DEFAULT_AGENT_CONFIG,
    model: "claude-sonnet-4-20250514" as const,
    maxTurns: 15,
    confidenceThreshold: 0.6,
  },
  enrichment: {
    ...DEFAULT_AGENT_CONFIG,
    model: "claude-sonnet-4-20250514" as const,
    maxTurns: 25, // May need more turns for complex matching
    confidenceThreshold: 0.5,
  },
  duplicateDetection: {
    ...DEFAULT_AGENT_CONFIG,
    model: "claude-sonnet-4-20250514" as const,
    maxTurns: 15,
    confidenceThreshold: 0.8, // Higher threshold for merges
  },
} as const;
