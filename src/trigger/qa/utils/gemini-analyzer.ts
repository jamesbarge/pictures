import { generateText, GEMINI_MODELS, stripCodeFences } from "@/lib/gemini";

const LOG_PREFIX = "[qa-gemini]";
const PACING_DELAY_MS = 4_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 1. TMDB Mismatch Analysis
// ---------------------------------------------------------------------------

export async function analyzeTmdbMismatch(params: {
  frontEndTitle: string;
  dbTitle: string;
  dbTmdbId: number | null;
  posterUrl: string | null;
  synopsis: string | null;
}): Promise<{
  isMismatch: boolean;
  confidence: number;
  suggestedTitle: string | null;
  reason: string;
}> {
  const defaultResult = {
    isMismatch: false,
    confidence: 0,
    suggestedTitle: null,
    reason: "Analysis unavailable",
  };

  try {
    console.log(LOG_PREFIX, "Analyzing TMDB mismatch:", params.frontEndTitle, "vs", params.dbTitle);

    const prompt = `Compare these two film titles and determine if they refer to the same film.

Front-end title: "${params.frontEndTitle}"
Database title: "${params.dbTitle}"
TMDB ID: ${params.dbTmdbId ?? "none"}
Poster URL: ${params.posterUrl ?? "none"}
Synopsis: ${params.synopsis ?? "none"}

Important considerations:
- Cinema listings often add format suffixes like "35mm", "4K", "70mm", "IMAX" — these do NOT make it a different film.
- Prefixes/suffixes like "Q&A", "Special Screening", "Preview", "Members Only" should be ignored when comparing titles.
- Slight spelling variations, articles (The/A), and punctuation differences are acceptable matches.
- Foreign-language titles vs English titles of the same film should be flagged as a match with a note.

Return a JSON object with:
- isMismatch: boolean — true if they are genuinely different films, false if they are the same film
- confidence: number between 0 and 1
- suggestedTitle: string | null — if mismatched, the likely correct canonical title; otherwise null
- reason: string — brief explanation of your determination`;

    const raw = await generateText(prompt, {
      model: GEMINI_MODELS.flashLite,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          isMismatch: { type: "boolean" },
          confidence: { type: "number" },
          suggestedTitle: { type: ["string", "null"] },
          reason: { type: "string" },
        },
        required: ["isMismatch", "confidence", "suggestedTitle", "reason"],
      },
    });

    const parsed = JSON.parse(stripCodeFences(raw));
    await delay(PACING_DELAY_MS);
    return parsed;
  } catch (err) {
    console.log(LOG_PREFIX, "analyzeTmdbMismatch failed:", err);
    return defaultResult;
  }
}

// ---------------------------------------------------------------------------
// 2. Booking Page Content Analysis
// ---------------------------------------------------------------------------

export async function analyzeBookingPageContent(params: {
  expectedTitle: string;
  expectedTime: string;
  detectedTitle: string | null;
  detectedTime: string | null;
}): Promise<{ matches: boolean; confidence: number; reason: string }> {
  const defaultResult = {
    matches: true,
    confidence: 0,
    reason: "Analysis unavailable",
  };

  try {
    console.log(LOG_PREFIX, "Analyzing booking page content for:", params.expectedTitle);

    const prompt = `Compare the expected film details against what was detected on a cinema booking page.

Expected title: "${params.expectedTitle}"
Expected time: "${params.expectedTime}"
Detected title: "${params.detectedTitle ?? "not found"}"
Detected time: "${params.detectedTime ?? "not found"}"

Important considerations:
- Cinemas often add prefixes/suffixes to titles: "Q&A:", "Special Screening:", "35mm", "4K", "Preview", "Members Only", etc.
- The detected title may include the cinema's own branding or event name wrapping the film title.
- Minor punctuation, capitalisation, and article differences are acceptable.
- If the detected title is null/not found, that alone is not a mismatch — it may be a scraping limitation.
- Time formats may differ (12h vs 24h, with/without leading zeros).

Return a JSON object with:
- matches: boolean — true if the booking page appears to be for the correct film
- confidence: number between 0 and 1
- reason: string — brief explanation`;

    const raw = await generateText(prompt, {
      model: GEMINI_MODELS.flashLite,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          matches: { type: "boolean" },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["matches", "confidence", "reason"],
      },
    });

    const parsed = JSON.parse(stripCodeFences(raw));
    await delay(PACING_DELAY_MS);
    return parsed;
  } catch (err) {
    console.log(LOG_PREFIX, "analyzeBookingPageContent failed:", err);
    return defaultResult;
  }
}

// ---------------------------------------------------------------------------
// 3. Batch Anomaly Review
// ---------------------------------------------------------------------------

export async function batchAnomalyReview(
  discrepancies: Array<{
    type: string;
    filmTitle: string;
    detail: string;
  }>
): Promise<
  Array<{
    index: number;
    severity: "critical" | "warning" | "info";
    recommendation: string;
  }>
> {
  const defaultResult = discrepancies.map((_, i) => ({
    index: i,
    severity: "info" as const,
    recommendation: "Unable to analyse — manual review recommended",
  }));

  if (discrepancies.length === 0) return [];

  try {
    console.log(LOG_PREFIX, "Batch reviewing", discrepancies.length, "anomalies");

    const prompt = `Review the following discrepancies found during a QA audit of a cinema listings website. For each item, assess severity and provide a recommendation.

Discrepancies:
${discrepancies.map((d, i) => `${i}. [${d.type}] "${d.filmTitle}" — ${d.detail}`).join("\n")}

For each discrepancy, determine:
- severity: "critical" (data is wrong and user-facing), "warning" (potential issue, needs investigation), or "info" (cosmetic or low-impact)
- recommendation: a brief actionable recommendation

Return a JSON array where each element has:
- index: number (matching the discrepancy index above)
- severity: "critical" | "warning" | "info"
- recommendation: string`;

    const raw = await generateText(prompt, {
      model: GEMINI_MODELS.flashLite,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            severity: { type: "string", enum: ["critical", "warning", "info"] },
            recommendation: { type: "string" },
          },
          required: ["index", "severity", "recommendation"],
        },
      },
    });

    const parsed = JSON.parse(stripCodeFences(raw));
    await delay(PACING_DELAY_MS);
    return parsed;
  } catch (err) {
    console.log(LOG_PREFIX, "batchAnomalyReview failed:", err);
    return defaultResult;
  }
}

// ---------------------------------------------------------------------------
// 4. Prevention Report Generation
// ---------------------------------------------------------------------------

export async function generatePreventionReport(params: {
  issues: Array<{
    type: string;
    cinemaId: string;
    description: string;
    fixStatus: string;
  }>;
  scraperSchedules: string;
}): Promise<string> {
  try {
    console.log(LOG_PREFIX, "Generating prevention report for", params.issues.length, "issues");

    const prompt = `You are a senior engineer reviewing QA issues found on a cinema listings platform (pictures.london). Generate a prevention report with specific, actionable recommendations.

## Detected Issues
${params.issues.map((issue, i) => `${i + 1}. [${issue.type}] Cinema: ${issue.cinemaId} — ${issue.description} (Status: ${issue.fixStatus})`).join("\n")}

## Scraper Configuration
${params.scraperSchedules}

## Instructions
Generate a markdown report (Part 3: Prevention Recommendations) that includes:
1. Root cause analysis for recurring issue types
2. Specific configuration changes (reference file paths like src/trigger/scrapers/*, config values, cron schedules)
3. Suggested schedule adjustments if timing-related issues are detected
4. Any recommended code changes or new validation rules
5. Priority ordering (fix the most impactful issues first)

Be specific — reference actual file paths, config values, and schedule changes where possible.
Keep the report concise but actionable. Use markdown formatting suitable for Telegram (bold, bullet points, code blocks).`;

    const raw = await generateText(prompt, {
      model: GEMINI_MODELS.pro,
      systemPrompt:
        "You are a DevOps engineer specialising in web scraper reliability and data quality. Return a markdown string — not JSON.",
    });

    return raw;
  } catch (err) {
    console.log(LOG_PREFIX, "generatePreventionReport failed:", err);
    return "⚠️ Prevention report generation failed. Manual review recommended.";
  }
}
