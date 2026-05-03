/**
 * Embedding capability — self-hosted bge-m3 via Ollama.
 *
 * Phase 3 of the scraping rethink. This module provides text →
 * embedding-vector conversion by talking to the same local Ollama server
 * the vision module uses (default: http://localhost:11434). No API key
 * required at runtime — bge-m3 runs entirely on-device.
 *
 * Setup (one-time):
 *   ollama pull bge-m3
 *
 * bge-m3 was chosen over Voyage-4-large for two reasons (Stream 6
 * `Pictures/Research/scraping-rethink-2026-05/06-enrichment.md`):
 *   1. Multilingual: 100-language shared embedding space handles the
 *      bilingual title pairs (Spanish/English, Czech/English, etc.) that
 *      currently merge incorrectly via trigram-only.
 *   2. £0 marginal cost: self-hosted, ~1024-dimension vectors at ~50ms
 *      per query on M-series Macs.
 *
 * The riskiest assumption (Stream 6) is that general-purpose embeddings
 * are adequate for short film-title dedup (3-8 token average title
 * length). The mitigation is the LLM-judge gate in
 * `judgeMatchCandidates()` below — near-threshold cases (similarity
 * 0.85-0.92) escalate to Claude-via-Claude-Code rather than auto-merging.
 *
 * Callers MUST wrap embed() in try/catch and fall back to trigram —
 * Ollama may be down, the model may not be pulled, or the request may
 * time out. checkBgeHealth() lets the slash command probe at startup.
 */

const DEFAULT_MODEL = "bge-m3";
const DEFAULT_URL = "http://localhost:11434";
const HEALTH_TIMEOUT_MS = 2_000;
const EMBED_TIMEOUT_MS = 10_000;

interface EmbedOptions {
  model?: string;
  ollamaUrl?: string;
}

function resolveOptions(options?: EmbedOptions): { model: string; ollamaUrl: string } {
  return {
    model: options?.model ?? process.env.OLLAMA_EMBEDDING_MODEL ?? DEFAULT_MODEL,
    ollamaUrl: options?.ollamaUrl ?? process.env.OLLAMA_URL ?? DEFAULT_URL,
  };
}

/**
 * Convert one or more pieces of text into bge-m3 embedding vectors.
 * Throws if Ollama is unreachable, returns non-2xx, or omits the
 * `embeddings` array.
 */
export async function embed(
  inputs: string[],
  options?: EmbedOptions,
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const { model, ollamaUrl } = resolveOptions(options);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `Ollama embed request failed: ${res.status} ${res.statusText}`,
      );
    }

    const body = (await res.json()) as { embeddings?: number[][] };
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== inputs.length) {
      throw new Error(
        `Ollama embed response missing or wrong-length 'embeddings' array (got ${
          body.embeddings?.length ?? "undefined"
        }, expected ${inputs.length})`,
      );
    }
    return body.embeddings;
  } finally {
    clearTimeout(timer);
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Threshold bands for the dedup pipeline. See Stream 6's full design.
 *
 * - >= 0.92: auto-merge candidate. Still gated by `safetyFloors.minAutoMergeSimilarity`
 *            from `data-quality/thresholds.json` (currently 0.85, tighter floor).
 * - 0.85 - 0.92: ambiguous. Escalate to Claude-judge.
 * - < 0.85: do not merge.
 */
export const SIMILARITY_THRESHOLDS = {
  autoMerge: 0.92,
  judgeBand: 0.85,
  doNotMerge: 0.85,
} as const;

/**
 * Quick health check: returns true if Ollama is responsive AND has the
 * configured embedding model available. Used by `/scrape` slash command
 * pre-flight.
 */
export async function checkBgeHealth(
  options?: EmbedOptions,
): Promise<{ available: boolean; reason?: string }> {
  const { model, ollamaUrl } = resolveOptions(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { available: false, reason: `tags endpoint returned ${res.status}` };
    }
    const body = (await res.json()) as { models?: Array<{ model?: string }> };
    const tags = body.models ?? [];
    const found = tags.some((m) => {
      const name = m.model ?? "";
      return name === model || name.startsWith(`${model}:`);
    });
    if (!found) {
      return {
        available: false,
        reason: `model '${model}' not pulled — run \`ollama pull ${model}\``,
      };
    }
    return { available: true };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timed out after ${HEALTH_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    return { available: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Claude-judge stub for ambiguous match cases (similarity in the 0.85-0.92
 * band, or any case where the deterministic matcher is unsure).
 *
 * **Not yet wired up.** The plan (Stream 6) is to invoke this from the
 * enrichment pass when a candidate score lands between `judgeBand` and
 * `autoMerge`. The actual call goes through Claude Code's bundled Claude
 * access (subagent dispatch or the Agent SDK), so it costs £0 marginal.
 *
 * Callers will pass:
 *   - The raw scraped title + cinema id
 *   - Up to ~3 TMDB candidates (with id, title, year, director, popularity)
 *   - Optional context from the cinema (programming theme, brand prefixes)
 *
 * Expected return: { selectedTmdbId | null, confidence, rationale }.
 *
 * Stub returns null to mean "no decision yet — defer to existing
 * heuristic". This keeps Phase 3 schema/type-shape work landed without
 * wiring the live Claude call until the spike validates the approach.
 */
export interface ClaudeJudgeInput {
  rawTitle: string;
  cinemaId: string | null;
  candidates: Array<{
    tmdbId: number;
    title: string;
    year: number | null;
    director: string | null;
    popularity: number | null;
    similarityScore: number;
  }>;
  cinemaContext?: string;
}

export interface ClaudeJudgeResult {
  selectedTmdbId: number | null;
  confidence: number;
  rationale: string;
}

/** Stub — returns null until wired to Claude Code subagent dispatch. */
export async function judgeMatchCandidates(
  _input: ClaudeJudgeInput,
): Promise<ClaudeJudgeResult | null> {
  return null;
}
