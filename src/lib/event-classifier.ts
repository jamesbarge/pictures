/**
 * Event Classifier
 *
 * Uses Claude to extract structured event metadata from film titles and descriptions.
 * Detects: event types, formats, accessibility features, and seasons.
 */

import { generateText, stripCodeFences } from "./gemini";
import type { EventType, ScreeningFormat } from "@/types/screening";

// Valid event types from the schema
const VALID_EVENT_TYPES: EventType[] = [
  "q_and_a",
  "intro",
  "discussion",
  "double_bill",
  "marathon",
  "singalong",
  "quote_along",
  "preview",
  "premiere",
  "restoration_premiere",
  "anniversary",
  "members_only",
  "relaxed",
];

// Valid formats from the schema
const VALID_FORMATS: ScreeningFormat[] = [
  "35mm",
  "70mm",
  "70mm_imax",
  "dcp",
  "dcp_4k",
  "imax",
  "imax_laser",
  "dolby_cinema",
  "4dx",
  "screenx",
];

export interface EventClassification {
  // The actual film title (cleaned of event info)
  cleanTitle: string;

  // Event classification
  isSpecialEvent: boolean;
  eventTypes: EventType[]; // Can have multiple (e.g., premiere + q_and_a)
  eventDescription: string | null;

  // Format
  format: ScreeningFormat | null;
  is3D: boolean;

  // Accessibility
  hasSubtitles: boolean;
  subtitleLanguage: string | null;
  hasAudioDescription: boolean;
  isRelaxedScreening: boolean;

  // Season/Series
  season: string | null;

  // Confidence
  confidence: "high" | "medium" | "low";
}

/**
 * Classify a screening based on its title and optional description
 */
export async function classifyEvent(
  title: string,
  description?: string
): Promise<EventClassification> {
  const prompt = `You are a cinema event classifier. Analyze this screening and extract structured metadata.

Title: "${title}"
${description ? `Description: "${description}"` : ""}

Extract the following information in JSON format:

{
  "cleanTitle": "The actual film title without event prefixes/suffixes (e.g., 'UK PREMIERE: The Movie + Q&A' → 'The Movie')",
  "isSpecialEvent": true/false,
  "eventTypes": ["array of event types from: ${VALID_EVENT_TYPES.join(", ")}"],
  "eventDescription": "Brief description of the event or null",
  "format": "one of: ${VALID_FORMATS.join(", ")} or null",
  "is3D": true/false,
  "hasSubtitles": true/false,
  "subtitleLanguage": "language code or null",
  "hasAudioDescription": true/false,
  "isRelaxedScreening": true/false,
  "season": "Name of season/retrospective or null (e.g., 'Hitchcock: Master of Suspense')",
  "confidence": "high/medium/low"
}

Rules:
- "Sing-A-Long", "Singalong" → eventTypes: ["singalong"]
- "Q&A", "+ Q&A" → eventTypes include "q_and_a"
- "Preview" → eventTypes: ["preview"]
- "UK/World/London Premiere" → eventTypes: ["premiere"]
- "Double Bill", "2 films" → eventTypes: ["double_bill"]
- "Marathon" → eventTypes: ["marathon"]
- "(35mm)", "35mm print" → format: "35mm"
- "(70mm)" → format: "70mm"
- "IMAX" → format: "imax"
- "4K", "4K Restoration" → format: "dcp_4k"
- "3D" → is3D: true
- "Relaxed screening" → isRelaxedScreening: true
- "With subtitles", "Subtitled" → hasSubtitles: true
- "Audio described", "AD" → hasAudioDescription: true
- Season examples: "BFI Thriller Season", "Hitchcock Retrospective", "French New Wave"

Return ONLY valid JSON, no explanation.`;

  // Retry with exponential backoff for rate limits
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const text = await generateText(prompt);

      // Parse JSON response
      const json = JSON.parse(stripCodeFences(text));

      // Validate and normalize the response
      return {
        cleanTitle: json.cleanTitle || title,
        isSpecialEvent: json.isSpecialEvent === true || (json.eventTypes?.length || 0) > 0,
        eventTypes: (json.eventTypes || []).filter((t: string) =>
          VALID_EVENT_TYPES.includes(t as EventType)
        ),
        eventDescription: json.eventDescription || null,
        format: VALID_FORMATS.includes(json.format) ? json.format : null,
        is3D: json.is3D === true,
        hasSubtitles: json.hasSubtitles === true,
        subtitleLanguage: json.subtitleLanguage || null,
        hasAudioDescription: json.hasAudioDescription === true,
        isRelaxedScreening: json.isRelaxedScreening === true,
        season: json.season || null,
        confidence: json.confidence || "medium",
      };
    } catch (e: unknown) {
      lastError = e as Error;

      // Check for rate limit error (429 or RESOURCE_EXHAUSTED)
      const isRateLimit =
        (e as { status?: number })?.status === 429 ||
        (e as { message?: string })?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff: 15s, 30s, 60s (respects 5 req/min limit)
        const waitTime = 15000 * Math.pow(2, attempt);
        console.log(
          `[EventClassifier] Rate limited, waiting ${waitTime / 1000}s before retry ${attempt + 2}/${maxRetries}...`
        );
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }

      // Non-rate-limit error or final retry - don't retry
      break;
    }
  }

  // All retries failed
  console.warn("[EventClassifier] Failed to classify:", title, lastError);
  return {
    cleanTitle: title,
    isSpecialEvent: false,
    eventTypes: [],
    eventDescription: null,
    format: null,
    is3D: false,
    hasSubtitles: false,
    subtitleLanguage: null,
    hasAudioDescription: false,
    isRelaxedScreening: false,
    season: null,
    confidence: "low",
  };
}

/**
 * Batch classify multiple screenings (more efficient)
 */
export async function classifyEventsBatch(
  items: Array<{ title: string; description?: string }>
): Promise<EventClassification[]> {
  // For now, process sequentially with small delays to avoid rate limits
  // Could be optimized with parallel requests in batches
  const results: EventClassification[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = await classifyEvent(item.title, item.description);
    results.push(result);

    // Small delay between requests
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return results;
}

/**
 * Quick heuristic check - does this title likely need classification?
 * Use this to filter before calling the more expensive Claude API
 */
export function likelyNeedsClassification(title: string): boolean {
  const patterns = [
    /\bq\s*&\s*a\b/i,
    /\+\s*q&a/i,
    /\bpreview\b/i,
    /\bpremiere\b/i,
    /\bsing[\s-]*a[\s-]*long/i,
    /\bsingalong\b/i,
    /\bdouble\s*bill\b/i,
    /\bmarathon\b/i,
    /\b35mm\b/i,
    /\b70mm\b/i,
    /\bimax\b/i,
    /\b4k\b/i,
    /\b3d\b/i,
    /\brelaxed\b/i,
    /\bsubtitle/i,
    /\baudio\s*descri/i,
    /\bintro\b/i,
    /\bdiscussion\b/i,
    /\banniversary\b/i,
    /\brestoration\b/i,
    /\bseason\b/i,
    /\bretrospective\b/i,
  ];

  return patterns.some((p) => p.test(title));
}

// Cache for classifications to avoid re-processing
const classificationCache = new Map<string, EventClassification>();

/**
 * Classify with caching
 */
export async function classifyEventCached(
  title: string,
  description?: string
): Promise<EventClassification> {
  const cacheKey = `${title}|${description || ""}`;

  if (classificationCache.has(cacheKey)) {
    return classificationCache.get(cacheKey)!;
  }

  const result = await classifyEvent(title, description);
  classificationCache.set(cacheKey, result);

  return result;
}

/**
 * Clear the classification cache
 */
export function clearClassificationCache(): void {
  classificationCache.clear();
}
