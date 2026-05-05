/**
 * Event Classifier
 *
 * Extracts structured event metadata from a screening title and optional
 * description using deterministic regex rules — no LLM calls. Emits an
 * EventClassification covering: clean film title, event types, screening
 * format, accessibility flags, and (when present) the season/series name.
 *
 * The rules below were lifted from the previous Gemini prompt's "Rules:"
 * section and codified verbatim. The output shape is identical to the
 * previous AI-backed implementation, so callers do not change.
 */

import {
  extractFilmTitleSync,
  type PatternExtractionResult,
} from "./title-extraction/pattern-extractor";
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

interface EventClassification {
  cleanTitle: string;
  isSpecialEvent: boolean;
  eventTypes: EventType[];
  eventDescription: string | null;
  format: ScreeningFormat | null;
  is3D: boolean;
  hasSubtitles: boolean;
  subtitleLanguage: string | null;
  hasAudioDescription: boolean;
  isRelaxedScreening: boolean;
  season: string | null;
  confidence: "high" | "medium" | "low";
}

/* -------------------------------------------------------------------------- */
/* Rules tables                                                               */
/* -------------------------------------------------------------------------- */

// Event type detection. Order matters: more specific patterns first.
const EVENT_TYPE_RULES: ReadonlyArray<{ pattern: RegExp; type: EventType }> = [
  { pattern: /\brestoration\s+premiere\b/i, type: "restoration_premiere" },
  { pattern: /\b(?:uk|world|london|european)\s+premiere\b|\bpremiere\b/i, type: "premiere" },
  { pattern: /\bsneak\s+preview\b|\bpreview\s+screening\b|\b\+\s*preview\b|\bpreview\b/i, type: "preview" },
  { pattern: /\bsing[\s-]*a[\s-]*long\b|\bsingalong\b/i, type: "singalong" },
  { pattern: /\bquote[\s-]*a[\s-]*long\b/i, type: "quote_along" },
  { pattern: /\bq\s*&\s*a\b|\+\s*q&a/i, type: "q_and_a" },
  { pattern: /\bintro(?:duced)?\s+by\b|\b\+\s*intro\b|\bwith\s+intro\b/i, type: "intro" },
  { pattern: /\bpanel\s+discussion\b|\b\+\s*discussion\b/i, type: "discussion" },
  { pattern: /\bdouble\s+bill\b|\bdouble\s+feature\b|\b2\s+films\b/i, type: "double_bill" },
  { pattern: /\bmarathon\b/i, type: "marathon" },
  { pattern: /\b\d+(?:st|nd|rd|th)\s+anniversary\b|\banniversary\s+screening\b/i, type: "anniversary" },
  { pattern: /\bmembers[\s']*only\b|\bmembership\s+screening\b/i, type: "members_only" },
  { pattern: /\brelaxed\s+(?:screening|film|cinema)\b/i, type: "relaxed" },
];

// Format detection. Order matters: 70mm IMAX before plain 70mm/IMAX.
const FORMAT_RULES: ReadonlyArray<{ pattern: RegExp; format: ScreeningFormat }> = [
  { pattern: /\b70mm\s+imax\b/i, format: "70mm_imax" },
  { pattern: /\b70mm\b|\(70mm\)/i, format: "70mm" },
  { pattern: /\b35mm\b|\(35mm\)/i, format: "35mm" },
  { pattern: /\bimax\s+(?:laser|with\s+laser)\b/i, format: "imax_laser" },
  { pattern: /\bimax\b/i, format: "imax" },
  { pattern: /\bdolby\s+cinema\b/i, format: "dolby_cinema" },
  { pattern: /\b4dx\b/i, format: "4dx" },
  { pattern: /\bscreenx\b/i, format: "screenx" },
  { pattern: /\b4k\s+restoration\b|\b4k\s+remaster(?:ed)?\b|\b\(4k\)\b/i, format: "dcp_4k" },
];

// 3D and accessibility flags
const IS_3D_PATTERN = /\b(?:in\s+)?3d\b|\b3-d\b/i;
const RELAXED_PATTERN = /\brelaxed\s+(?:screening|film|cinema|performance)\b/i;
const SUBTITLES_PATTERN = /\b(?:with\s+)?subtitles?\b|\bsubtitled\b|\bsubt\.?\b|\bcc\b(?!\s*\.)/i;
const AUDIO_DESCRIPTION_PATTERN = /\baudio[\s-]+described?\b|\b\bAD\b(?!\w)/;

// Season / retrospective extraction. We try to detect "X Season:", "X
// Retrospective:", "X presents:" etc. and capture the prefix as season name.
const SEASON_PATTERNS: ReadonlyArray<RegExp> = [
  /^([A-Z][^:]{4,80}?\s+(?:Season|Retrospective|Series|Festival|Programme|Strand))\s*:/i,
  /^([A-Z][^:]{4,80}?\s+presents?)\s*:/i,
];

// Subtitle-language hints. Map common keywords to ISO-ish language codes.
const SUBTITLE_LANGUAGE_RULES: ReadonlyArray<{ pattern: RegExp; lang: string }> = [
  { pattern: /\bfrench\s+subtitles\b/i, lang: "fr" },
  { pattern: /\bgerman\s+subtitles\b/i, lang: "de" },
  { pattern: /\bspanish\s+subtitles\b/i, lang: "es" },
  { pattern: /\bitalian\s+subtitles\b/i, lang: "it" },
  { pattern: /\b(?:english\s+subtitles|english\s+st)\b/i, lang: "en" },
  { pattern: /\bjapanese\s+subtitles\b/i, lang: "ja" },
];

/* -------------------------------------------------------------------------- */
/* Classifier                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Classify a screening based on its title and optional description.
 *
 * Async signature retained for backward compatibility with existing
 * callers (the previous implementation made network calls).
 */
export async function classifyEvent(
  title: string,
  description?: string
): Promise<EventClassification> {
  const haystack = description ? `${title} ${description}` : title;

  // 1) Event types — collect all matches, dedupe, preserve schema order.
  const matchedTypes = new Set<EventType>();
  for (const rule of EVENT_TYPE_RULES) {
    if (rule.pattern.test(haystack)) {
      matchedTypes.add(rule.type);
    }
  }
  const eventTypes: EventType[] = VALID_EVENT_TYPES.filter((t) => matchedTypes.has(t));

  // 2) Format — first match wins (rules ordered specific→general).
  let format: ScreeningFormat | null = null;
  for (const rule of FORMAT_RULES) {
    if (rule.pattern.test(haystack)) {
      format = rule.format;
      break;
    }
  }

  // 3) 3D and accessibility flags
  const is3D = IS_3D_PATTERN.test(haystack);
  const isRelaxedScreening = RELAXED_PATTERN.test(haystack);
  const hasSubtitles = SUBTITLES_PATTERN.test(haystack);
  const hasAudioDescription = AUDIO_DESCRIPTION_PATTERN.test(haystack);

  // 4) Subtitle language (only meaningful if subtitles are present)
  let subtitleLanguage: string | null = null;
  if (hasSubtitles) {
    for (const rule of SUBTITLE_LANGUAGE_RULES) {
      if (rule.pattern.test(haystack)) {
        subtitleLanguage = rule.lang;
        break;
      }
    }
  }

  // 5) Season / series extraction — match against the title only, since
  // descriptions often mention seasons in passing.
  let season: string | null = null;
  for (const pattern of SEASON_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      season = match[1].trim();
      break;
    }
  }

  // 6) Clean title — delegate to the synchronous pattern-based extractor.
  const cleaned = extractFilmTitleSync(title);
  const cleanTitle = cleaned.extractedTitle || title;

  // 7) Confidence — high when the pattern extractor was confident or no
  // event signals fired; medium otherwise; low only on truly ambiguous
  // input (long title, no signals, multiple colons).
  const confidence = computeConfidence(title, cleaned, eventTypes, format);

  // 8) isSpecialEvent — true if any event signal fired.
  const isSpecialEvent =
    eventTypes.length > 0 ||
    format !== null ||
    is3D ||
    hasSubtitles ||
    hasAudioDescription ||
    isRelaxedScreening ||
    season !== null;

  // 9) Event description — surface the title remainder when extraction
  // stripped a prefix or suffix; otherwise null.
  const eventDescription =
    cleaned.extractionMethod !== "none" && cleaned.extractedTitle !== title
      ? title.replace(cleaned.extractedTitle, "").replace(/^[\s:|+\-]+|[\s:|+\-]+$/g, "") || null
      : null;

  return {
    cleanTitle,
    isSpecialEvent,
    eventTypes,
    eventDescription,
    format,
    is3D,
    hasSubtitles,
    subtitleLanguage,
    hasAudioDescription,
    isRelaxedScreening,
    season,
    confidence,
  };
}

function computeConfidence(
  rawTitle: string,
  cleaned: PatternExtractionResult,
  eventTypes: EventType[],
  format: ScreeningFormat | null
): "high" | "medium" | "low" {
  // Pattern extractor's numeric confidence (0–1) is the strongest signal.
  if (cleaned.confidence >= 0.85) return "high";
  if (cleaned.confidence >= 0.5) return "medium";

  // If we matched at least one event signal but the extractor was unsure,
  // bias toward medium rather than low — we still produced useful metadata.
  if (eventTypes.length > 0 || format !== null) return "medium";

  // Title with multiple colons and no extractor confidence is ambiguous.
  if (rawTitle.split(":").length > 2) return "low";

  // Default: medium for everything else.
  return "medium";
}

/**
 * Quick heuristic check — does this title likely need classification?
 * Use this to skip the classifier entirely on obviously-clean titles.
 *
 * Same regex set as the previous implementation — kept as a public export
 * because callers (e.g. screening-classification) use it as a gate.
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

// Cache for classifications to avoid re-processing identical titles.
const classificationCache = new Map<string, EventClassification>();

/**
 * Classify with caching. Async signature preserved for caller compatibility.
 */
export async function classifyEventCached(
  title: string,
  description?: string
): Promise<EventClassification> {
  const cacheKey = `${title}|${description || ""}`;

  const cached = classificationCache.get(cacheKey);
  if (cached) return cached;

  const result = await classifyEvent(title, description);
  classificationCache.set(cacheKey, result);
  return result;
}
