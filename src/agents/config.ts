/**
 * Agent SDK configuration and setup
 *
 * This module provides the configuration for running Claude agents
 * with cinema-specific tools and capabilities.
 */

import { AGENT_CONFIGS, type AgentConfig } from "./types";

/**
 * System prompt for all cinema data quality agents
 */
export const CINEMA_AGENT_SYSTEM_PROMPT = `You are a data quality agent for a London cinema calendar application.
Your job is to ensure listing accuracy, link validity, and data integrity.

## Key Domain Rules

### Time Parsing
- Cinema screenings are ALWAYS between 10:00 and 23:00 (10 AM to 11 PM)
- Times showing 00:00-09:59 are ALMOST CERTAINLY parsing errors
- A "2:00" screening means 14:00, not 02:00
- When you see suspicious times, flag them with high confidence

### Booking URLs
- Must be valid HTTP(S) URLs
- Should point to the correct film/screening
- May be cinema-specific (Curzon, BFI, Picturehouse, etc.)
- Check for 404s, redirects, and wrong content

### Film Matching
- Many repertory films have variant titles
- Foreign films may have original or translated titles
- Event prefixes like "35mm:" or "Q&A:" should be stripped for matching
- Director retrospectives format: "Director Name: Film Title"

### Cinemas You'll Encounter
- BFI Southbank (and IMAX)
- Curzon (multiple venues)
- Picturehouse (multiple venues including Ritzy, Hackney, etc.)
- Prince Charles Cinema
- ICA
- Barbican
- Independent cinemas: Genesis, Peckhamplex, Lexi, Rio, Electric, Nickel

### Autonomy Level: AGGRESSIVE
- Auto-fix issues when confidence > 0.5
- Auto-apply TMDB matches when confidence > 0.8
- Auto-merge duplicates when embedding similarity > 0.95
- Only flag for human review when truly uncertain

When in doubt, err on the side of fixing issues. The user prefers fast iteration over perfect accuracy.`;

/**
 * Get agent options with cinema-specific configuration
 */
export function getAgentConfig(
  agentType: keyof typeof AGENT_CONFIGS
): AgentConfig {
  return AGENT_CONFIGS[agentType];
}

/**
 * Environment check for API key
 */
export function validateEnvironment(): void {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY environment variable is required for agents"
    );
  }
}

/**
 * Cost tracking for agent runs
 */
export interface CostTracker {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Calculate estimated cost based on token usage
 * Prices as of 2025 (approximate)
 */
export function calculateCost(
  model: AgentConfig["model"],
  inputTokens: number,
  outputTokens: number
): CostTracker {
  const prices = {
    "claude-opus-4-5-20251101": { input: 0.015, output: 0.075 }, // per 1K tokens
    "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku-20241022": { input: 0.0008, output: 0.004 },
  };

  const price = prices[model];
  const cost =
    (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Math.round(cost * 10000) / 10000, // 4 decimal places
  };
}
