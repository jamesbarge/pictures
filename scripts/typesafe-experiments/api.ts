import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { MODEL, type EvaluationRecord, type EvaluationRequest, type EvaluationResponse, type Json } from "./types";

const INPUT_USD_PER_TOKEN = 0.042 / 1_000_000;
const TIMEOUT_MS = 30_000;
const probability = z.number().min(0).max(1);
const json = z.json();
const questionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), instructions: json, criteria: z.record(z.string(), json) }).strict(),
  z.object({ type: z.literal("noul"), instructions: json, criteria: z.object({ true: json, false: json }).strict().optional() }).strict(),
  z.object({ type: z.literal("score"), instructions: json, criteria: z.array(json).min(2).max(10) }).strict(),
]);
const requestSchema = z.object({
  model: z.literal(MODEL), state: json, questions: z.record(z.string(), questionSchema),
}).strict();
const responseSchema = z.object({
  model: z.literal(MODEL),
  answers: z.record(z.string(), z.discriminatedUnion("type", [
    z.object({ type: z.literal("choice"), choice: z.string(), probabilities: z.record(z.string(), probability), confidence: probability }).strict(),
    z.object({ type: z.literal("noul"), noul: probability }).strict(),
    z.object({ type: z.literal("score"), score: z.number().min(0), legend: z.record(z.string(), json), probabilities: z.record(z.string(), probability), confidence: probability }).strict(),
  ])),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).strict(),
}).strict();
const ledgerSchema = z.object({
  version: z.literal(1), budgetUsd: z.number().positive().max(5), spentUsd: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  networkRequests: z.number().int().nonnegative(), reservations: z.record(z.string(), z.number().nonnegative()),
}).strict();
type Ledger = z.infer<typeof ledgerSchema>;

export class TypeSafeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TypeSafeError";
  }
}

function failure(code: string, message: string): never { throw new TypeSafeError(code, message); }

function canonical(value: Json, preserveOrder = false): Json {
  if (Array.isArray(value)) return value.map((item) => canonical(item));
  if (value === null || typeof value !== "object") return value;
  const keys = Object.keys(value);
  if (!preserveOrder) keys.sort();
  return Object.fromEntries(keys.map((key) => [key, canonical(value[key], key === "criteria" && value.type === "choice")]));
}

/** Choice order is deliberate experiment input and must produce a distinct cache key. */
export function serializeRequest(request: EvaluationRequest): string {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success || Object.keys(request.questions).length === 0) failure("INVALID_REQUEST", "Invalid TypeSafe experiment request.");
  for (const question of Object.values(request.questions)) {
    if (question.type === "choice" && (Object.keys(question.criteria).length < 2 || Object.keys(question.criteria).length > 255)) {
      failure("INVALID_REQUEST", "Choice questions require between 2 and 255 options.");
    }
  }
  return JSON.stringify(canonical(parsed.data as Json));
}

export function estimateReservationUsd(request: EvaluationRequest): number {
  // The byte estimate exceeds ordinary text tokenization; the model's complete
  // documented context limit provides a conservative floor for short requests.
  const tokens = Math.max(64_000, Buffer.byteLength(serializeRequest(request), "utf8") + 2_048 + 256 * Object.keys(request.questions).length);
  return tokens * INPUT_USD_PER_TOKEN;
}

function sameKeys(left: object, right: object): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key));
}

function roundingSlack(value: number): number {
  // Live Jev responses round probabilities and scores to two decimal places.
  // Higher precision responses need only floating-point slack. Keep the wire
  // values unchanged; validate that a normalized distribution could round to them.
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8 ? 0.005 : 1e-8;
}

function probabilityIntervals(probabilities: Record<string, number>) {
  return Object.entries(probabilities).map(([level, value]) => ({
    level: Number(level), lower: Math.max(0, value - roundingSlack(value)), upper: Math.min(1, value + roundingSlack(value)),
  }));
}

export function validateResponse(request: EvaluationRequest, value: unknown): EvaluationResponse {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) {
    // Report the schema rule, not the rejected provider value or arbitrary keys.
    const issue = parsed.error.issues[0];
    const field = issue.path.filter((part) => ["model", "answers", "usage", "type", "choice", "probabilities", "confidence", "noul", "score", "legend", "input_tokens", "output_tokens"].includes(String(part))).join(".");
    failure("INVALID_RESPONSE", `TypeSafe response schema failed at ${field || "root"} (${issue.code}).`);
  }
  if (!sameKeys(request.questions, parsed.data.answers)) failure("INVALID_RESPONSE", "TypeSafe returned missing or unexpected answer IDs.");
  const response = parsed.data;
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = response.answers[id];
    if (answer.type !== question.type) failure("INVALID_RESPONSE", "TypeSafe answer type does not match its question.");
    if (answer.type === "noul") continue;
    const intervals = probabilityIntervals(answer.probabilities);
    const lowerTotal = intervals.reduce((sum, interval) => sum + interval.lower, 0);
    const upperTotal = intervals.reduce((sum, interval) => sum + interval.upper, 0);
    if (lowerTotal > 1 + 1e-8 || upperTotal < 1 - 1e-8) {
      const total = Object.values(answer.probabilities).reduce((sum, value) => sum + value, 0);
      failure("INVALID_RESPONSE", `TypeSafe ${answer.type} answer probabilities sum to ${total}, incompatible with a normalized distribution after rounding.`);
    }
    if (question.type === "choice" && answer.type === "choice") {
      if (!sameKeys(question.criteria, answer.probabilities) || !Object.hasOwn(question.criteria, answer.choice)) {
        failure("INVALID_RESPONSE", "TypeSafe returned an unknown or missing choice option.");
      }
      if (answer.probabilities[answer.choice] + 0.001 < Math.max(...Object.values(answer.probabilities))) {
        failure("INVALID_RESPONSE", "TypeSafe choice does not match its probability distribution.");
      }
    }
    if (question.type === "score" && answer.type === "score") {
      const expected = Object.fromEntries(question.criteria.map((criterion, index) => [String(index), criterion]));
      if (!sameKeys(expected, answer.probabilities) || JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(answer.legend))) {
        failure("INVALID_RESPONSE", "TypeSafe score levels do not match the requested rubric.");
      }
      if (answer.score > question.criteria.length - 1) failure("INVALID_RESPONSE", "TypeSafe score is outside the requested rubric's range.");
    }
  }
  return response;
}

/** Raw histogram arithmetic is diagnostic: the public API does not promise a
 * precision bound relating its displayed probabilities to its returned Score.
 * Consumers use the returned Score and preserve both fields for inspection.
 */
export function responseDiagnostics(response: EvaluationResponse) {
  return Object.entries(response.answers).flatMap(([questionId, answer]) => {
    if (answer.type === "noul") return [];
    const probabilitySum = Object.values(answer.probabilities).reduce((sum, value) => sum + value, 0);
    const weightedScore = answer.type === "score"
      ? Object.entries(answer.probabilities).reduce((sum, [level, value]) => sum + Number(level) * value, 0)
      : undefined;
    const scoreDifference = answer.type === "score" ? answer.score - weightedScore! : undefined;
    if (Math.abs(probabilitySum - 1) <= 1e-8 && (scoreDifference === undefined || Math.abs(scoreDifference) <= 1e-8)) return [];
    return [{ questionId, probabilitySum, ...(answer.type === "score" ? { reportedScore: answer.score, weightedScore, scoreDifference } : {}) }];
  });
}

function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function redactEvidence(value: unknown, apiKey?: string): Json {
  if (typeof value === "string") {
    let text = apiKey ? value.replaceAll(apiKey, "[REDACTED]") : value;
    text = text.replace(/apikey_[a-z0-9]+_[a-z0-9]+/gi, "[REDACTED]");
    return text.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => redactEvidence(item, apiKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      String(redactEvidence(key, apiKey)),
      /authorization|api[_-]?key|access[_-]?token|secret|password/i.test(key) ? "[REDACTED]" : redactEvidence(item, apiKey),
    ]));
  }
  return value === null || typeof value === "boolean" || typeof value === "number" ? value : null;
}

export interface TypeSafeClientOptions {
  cacheDir: string;
  apiKey?: string;
  budgetUsd?: number;
  mode: "live" | "replay";
  fetchImpl?: typeof fetch;
}

export class TypeSafeClient {
  private readonly cacheDir: string;
  private readonly ledgerPath: string;
  private readonly apiKey?: string;
  private readonly budgetUsd: number;
  private readonly mode: "live" | "replay";
  private readonly fetchImpl: typeof fetch;
  private readonly pending = new Map<string, Promise<EvaluationRecord>>();
  private cacheHits = 0;
  private terminalError?: TypeSafeError;

  constructor(options: TypeSafeClientOptions) {
    this.cacheDir = resolve(options.cacheDir);
    this.ledgerPath = join(this.cacheDir, "budget-ledger.json");
    this.apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
    this.budgetUsd = options.budgetUsd ?? 5;
    this.mode = options.mode;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!Number.isFinite(this.budgetUsd) || this.budgetUsd <= 0 || this.budgetUsd > 5) failure("INVALID_BUDGET", "TypeSafe experiment budget must be greater than zero and no more than $5.");
    if (this.mode === "live" && !this.apiKey?.trim()) failure("MISSING_KEY", "TYPESAFE_API_KEY is required for live experiments.");
    if (this.mode === "live") mkdirSync(this.cacheDir, { recursive: true });
    this.readLedger();
  }

  private readLedger(): Ledger {
    if (!existsSync(this.ledgerPath)) return { version: 1, budgetUsd: this.budgetUsd, spentUsd: 0, inputTokens: 0, outputTokens: 0, networkRequests: 0, reservations: {} };
    try {
      const ledger = ledgerSchema.parse(JSON.parse(readFileSync(this.ledgerPath, "utf8")));
      ledger.budgetUsd = Math.min(this.budgetUsd, ledger.budgetUsd);
      return ledger;
    } catch { return failure("INVALID_LEDGER", "TypeSafe budget ledger is unreadable; refusing to reset its spending history."); }
  }

  get stats() {
    const ledger = this.readLedger();
    return {
      spentUsd: ledger.spentUsd,
      reservedUsd: Object.values(ledger.reservations).reduce((sum, cost) => sum + cost, 0),
      inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens,
      networkRequests: ledger.networkRequests, cacheHits: this.cacheHits,
    };
  }

  private reserve(cost: number): string {
    // No await between read, check and write: reservations are atomic across all
    // client instances in this process. Interrupted requests stay reserved on disk.
    const ledger = this.readLedger();
    const reserved = Object.values(ledger.reservations).reduce((sum, value) => sum + value, 0);
    if (ledger.spentUsd + reserved + cost > ledger.budgetUsd + Number.EPSILON) failure("BUDGET_EXCEEDED", "TypeSafe experiment spending limit reached before the next request.");
    const reservation = randomUUID();
    ledger.reservations[reservation] = cost;
    ledger.networkRequests += 1;
    atomicJson(this.ledgerPath, ledger);
    return reservation;
  }

  private settle(reservation: string, response?: EvaluationResponse): number {
    const ledger = this.readLedger();
    const reserved = ledger.reservations[reservation];
    if (reserved === undefined) failure("INVALID_LEDGER", "TypeSafe spending reservation is missing.");
    const cost = response ? response.usage.input_tokens * INPUT_USD_PER_TOKEN : reserved;
    delete ledger.reservations[reservation];
    ledger.spentUsd += cost;
    if (response) {
      ledger.inputTokens += response.usage.input_tokens;
      ledger.outputTokens += response.usage.output_tokens;
    }
    atomicJson(this.ledgerPath, ledger);
    if (cost > reserved + Number.EPSILON) {
      this.terminalError = new TypeSafeError("RESERVATION_EXCEEDED", "TypeSafe reported usage above its documented context bound; further calls are stopped.");
      throw this.terminalError;
    }
    return cost;
  }

  private cachedRecord(key: string, request: EvaluationRequest, serialized: string): EvaluationRecord | undefined {
    const path = join(this.cacheDir, `${key}.json`);
    if (!existsSync(path)) return undefined;
    try {
      const stored = JSON.parse(readFileSync(path, "utf8")) as EvaluationRecord;
      if (stored.key !== key || serializeRequest(stored.request) !== serialized || !Number.isFinite(stored.elapsedMs) || stored.elapsedMs < 0 || !Number.isInteger(stored.attempts) || stored.attempts < 1 || !Number.isFinite(stored.costUsd) || stored.costUsd < 0) {
        failure("INVALID_CACHE", "TypeSafe cached evaluation metadata is invalid.");
      }
      const response = validateResponse(request, stored.response);
      this.cacheHits += 1;
      return { key, request, response, elapsedMs: stored.elapsedMs, attempts: stored.attempts, costUsd: stored.costUsd, cached: true };
    } catch { return failure("INVALID_CACHE", "TypeSafe cached evaluation is invalid; refusing to use or overwrite it."); }
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationRecord> {
    const serialized = serializeRequest(request);
    if (this.apiKey && serialized.includes(this.apiKey)) failure("SECRET_IN_INPUT", "TypeSafe credentials must not appear in experiment inputs.");
    const key = createHash("sha256").update(serialized).digest("hex");
    const cached = this.cachedRecord(key, request, serialized);
    if (cached) return cached;
    if (this.mode === "replay") failure("CACHE_MISS", `TypeSafe replay cache has no evaluation for ${key}.`);
    if (this.terminalError) throw this.terminalError;
    const existing = this.pending.get(key);
    if (existing) return existing;
    // Snapshot the wire payload so callers cannot mutate a request during fetch.
    const operation = this.evaluateLive(JSON.parse(serialized) as EvaluationRequest, serialized, key);
    this.pending.set(key, operation);
    try { return await operation; } finally { this.pending.delete(key); }
  }

  private async evaluateLive(request: EvaluationRequest, body: string, key: string): Promise<EvaluationRecord> {
    const started = performance.now();
    let costUsd = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (this.terminalError) throw this.terminalError;
      const reservation = this.reserve(estimateReservationUsd(request));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      let value: unknown;
      try {
        response = await this.fetchImpl("https://api.typesafe.ai/v1/systemone", {
          method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, body, signal: controller.signal,
        });
        // Do not read error bodies: providers/proxies can echo authorization data.
        if (response.ok) value = await response.json();
      } catch {
        costUsd += this.settle(reservation);
        if (attempt === 3) failure("NETWORK_ERROR", "TypeSafe request failed after three attempts (network, timeout, or unreadable response).");
        clearTimeout(timeout);
        await this.backoff(attempt);
        continue;
      } finally { clearTimeout(timeout); }
      if (!response.ok) {
        costUsd += this.settle(reservation);
        if (response.status === 401 || response.status === 403) {
          this.terminalError = new TypeSafeError("AUTH_ERROR", "TypeSafe authentication failed; further requests are stopped.");
          throw this.terminalError;
        }
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          await this.backoff(attempt, response.headers.get("retry-after"));
          continue;
        }
        failure("HTTP_ERROR", `TypeSafe request failed with HTTP ${response.status}.`);
      }
      let validated: EvaluationResponse;
      try { validated = validateResponse(request, value); } catch (error) {
        this.settle(reservation);
        const message = error instanceof TypeSafeError ? error.message : "TypeSafe returned a response that failed experiment validation.";
        // Evidence is body JSON only; fetch options, headers and provider errors
        // never enter the artifact. Redact even unexpected fields in a bad body.
        atomicJson(join(this.cacheDir, `failure-${key}-${randomUUID()}.json`), redactEvidence({
          key, request, response: value, failure: { code: "INVALID_RESPONSE", message },
        }, this.apiKey));
        return failure("INVALID_RESPONSE", String(redactEvidence(message, this.apiKey)));
      }
      costUsd += this.settle(reservation, validated);
      const record: EvaluationRecord = { key, request, response: validated, elapsedMs: performance.now() - started, attempts: attempt, costUsd, cached: false };
      atomicJson(join(this.cacheDir, `${key}.json`), record);
      return record;
    }
    return failure("RETRY_EXHAUSTED", "TypeSafe retries exhausted.");
  }

  private async backoff(attempt: number, retryAfter?: string | null): Promise<void> {
    const seconds = retryAfter === null || retryAfter === undefined ? NaN : Number(retryAfter);
    const dateDelay = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1_000 : Number.isFinite(dateDelay) ? dateDelay : 500 * 2 ** (attempt - 1);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, Math.max(0, delay))));
  }
}
