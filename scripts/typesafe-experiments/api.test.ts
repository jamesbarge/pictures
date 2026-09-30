// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateReservationUsd, responseDiagnostics, serializeRequest, TypeSafeClient, validateResponse } from "./api";
import { MODEL, type EvaluationRequest, type EvaluationResponse } from "./types";

const API_KEY = "test-only-credential-never-persist";
const request: EvaluationRequest = {
  model: MODEL, state: { title: "Preview: Test Film" },
  questions: {
    title: { type: "choice", instructions: "Select the title.", criteria: { original: "Preview: Test Film", clean: "Test Film" } },
    event: { type: "noul", instructions: "Is this a film?" },
    relevance: { type: "score", instructions: "Does it match?", criteria: ["No match", "Strong match"] },
  },
};
function reply(): EvaluationResponse {
  return {
    model: MODEL,
    answers: {
      title: { type: "choice", choice: "clean", probabilities: { original: 0.1, clean: 0.9 }, confidence: 0.8 },
      event: { type: "noul", noul: 0.99 },
      relevance: { type: "score", score: 0.75, legend: { "0": "No match", "1": "Strong match" }, probabilities: { "0": 0.25, "1": 0.75 }, confidence: 0.5 },
    },
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}
const response = () => new Response(JSON.stringify(reply()), { status: 200 });
function otherRequest(): EvaluationRequest { return { ...request, state: { title: "A different film" } }; }

describe("TypeSafe transport", () => {
  let cacheDir: string;
  beforeEach(() => { cacheDir = mkdtempSync(join(tmpdir(), "pictures-typesafe-")); });
  afterEach(() => { vi.useRealTimers(); rmSync(cacheDir, { recursive: true, force: true }); });
  function client(fetchImpl: typeof fetch, options: { budgetUsd?: number; mode?: "live" | "replay" } = {}) {
    return new TypeSafeClient({ cacheDir, apiKey: API_KEY, mode: "live", fetchImpl, ...options });
  }

  it("sends the documented wire request, persists only safe data, and replays without network or credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response());
    const live = client(fetchImpl);
    const record = await live.evaluate(request);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual(request);
    expect(record).toMatchObject({ cached: false, attempts: 1, response: reply() });
    expect(live.stats).toMatchObject({ inputTokens: 100, outputTokens: 20, networkRequests: 1, reservedUsd: 0 });
    expect(live.stats.spentUsd).toBeCloseTo(0.0000042, 10);
    const files = readdirSync(cacheDir).map((name) => readFileSync(join(cacheDir, name), "utf8")).join("\n");
    expect(files).not.toContain(API_KEY);
    expect(files).not.toContain("Authorization");
    const noFetch = vi.fn<typeof fetch>();
    const replay = new TypeSafeClient({ cacheDir, mode: "replay", fetchImpl: noFetch });
    expect(await replay.evaluate(request)).toEqual({ ...record, cached: true });
    expect(replay.stats.cacheHits).toBe(1);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("canonicalizes incidental key order but preserves choice option order for stability experiments", () => {
    expect(serializeRequest(request)).toBe(serializeRequest({ questions: request.questions, state: request.state, model: request.model }));
    const changed = structuredClone(request);
    changed.questions.title = { ...request.questions.title, type: "choice", criteria: { clean: "Test Film", original: "Preview: Test Film" } };
    expect(serializeRequest(changed)).not.toBe(serializeRequest(request));
  });

  it("rejects a replay miss and corrupt cache rather than fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response());
    const replay = client(fetchImpl, { mode: "replay" });
    await expect(replay.evaluate(request)).rejects.toMatchObject({ code: "CACHE_MISS" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const record = await client(fetchImpl).evaluate(request);
    writeFileSync(join(cacheDir, `${record.key}.json`), "invalid json");
    await expect(replay.evaluate(request)).rejects.toMatchObject({ code: "INVALID_CACHE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing answer", (value: EvaluationResponse) => { delete value.answers.event; }],
    ["unknown answer", (value: EvaluationResponse) => { value.answers.extra = { type: "noul", noul: 0.5 }; }],
    ["invalid choice", (value: EvaluationResponse) => { if (value.answers.title.type === "choice") value.answers.title.choice = "unoffered"; }],
    ["missing probability", (value: EvaluationResponse) => { if (value.answers.title.type === "choice") delete value.answers.title.probabilities.original; }],
    ["bad probability sum", (value: EvaluationResponse) => { if (value.answers.title.type === "choice") value.answers.title.probabilities.original = 0.4; }],
    ["wrong answer type", (value: EvaluationResponse) => { value.answers.title = { type: "noul", noul: 0.5 }; }],
    ["bad score level", (value: EvaluationResponse) => { if (value.answers.relevance.type === "score") value.answers.relevance.legend["2"] = "Unrequested"; }],
    ["bad score value", (value: EvaluationResponse) => { if (value.answers.relevance.type === "score") value.answers.relevance.score = 2; }],
    ["wrong chosen maximum", (value: EvaluationResponse) => { if (value.answers.title.type === "choice") value.answers.title.choice = "original"; }],
    ["invalid confidence", (value: EvaluationResponse) => { if (value.answers.title.type === "choice") value.answers.title.confidence = 1.1; }],
    ["negative usage", (value: EvaluationResponse) => { value.usage.input_tokens = -1; }],
  ])("rejects %s without caching or retrying", async (_name, change) => {
    const value = reply();
    change(value);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
    const live = client(fetchImpl);
    await expect(live.evaluate(request)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readdirSync(cacheDir).filter((name) => name.startsWith("failure-"))).toHaveLength(1);
    expect(readdirSync(cacheDir).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))).toHaveLength(0);
    expect(live.stats.spentUsd).toBe(estimateReservationUsd(request));
  });

  it("preserves the validation reason and saves redacted body evidence without headers", async () => {
    const invalid = { ...reply(), unexpected: { echoed: API_KEY, authorization: "Bearer some-other-key" } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(invalid)));
    await expect(client(fetchImpl).evaluate(request)).rejects.toThrow("response schema failed at root (unrecognized_keys)");
    const file = readdirSync(cacheDir).find((name) => name.startsWith("failure-"))!;
    const saved = readFileSync(join(cacheDir, file), "utf8");
    expect(saved).not.toContain(API_KEY);
    expect(saved).not.toContain("some-other-key");
    expect(saved).not.toContain("headers");
    expect(JSON.parse(saved)).toMatchObject({ request, response: { unexpected: { echoed: "[REDACTED]", authorization: "[REDACTED]" } } });
  });

  it("accepts structured score rubrics and matching structured legends", () => {
    const structured = structuredClone(request);
    const value = reply();
    const levels = [{ description: "No match" }, { description: "Strong match" }];
    structured.questions.relevance = { type: "score", instructions: "Does it match?", criteria: levels };
    if (value.answers.relevance.type === "score") value.answers.relevance.legend = { "0": levels[0], "1": levels[1] };
    expect(validateResponse(structured, value)).toEqual(value);
  });

  it("accepts the observed 0.99 rounded probability total without changing the raw distribution", () => {
    const rounded = structuredClone(request);
    rounded.questions.title = { type: "choice", instructions: "Select the title.", criteria: { t0: "original", t1: "clean", t2: "suffix", none: "none" } };
    const value = reply();
    value.answers.title = { type: "choice", choice: "t1", probabilities: { t1: 0.81, t0: 0.01, t2: 0, none: 0.17 }, confidence: 0.75 };
    expect(validateResponse(rounded, value)).toEqual(value);
  });

  it("preserves the authoritative Score and reports histogram discrepancies without inventing precision guarantees", () => {
    const rounded = structuredClone(request);
    const criteria = ["No match", "Weak match", "Partial match", "Strong match"];
    rounded.questions.relevance = { type: "score", instructions: "Does it match?", criteria };
    const value = reply();
    value.answers.relevance = { type: "score", score: 0.24, legend: Object.fromEntries(criteria.map((label, index) => [String(index), label])), probabilities: { "0": 0.79, "1": 0.21, "2": 0, "3": 0 }, confidence: 0.76 };
    expect(validateResponse(rounded, value)).toEqual(value);
    const diagnostics = responseDiagnostics(value);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ questionId: "relevance", probabilitySum: 1, reportedScore: 0.24, weightedScore: 0.21 });
    expect(diagnostics[0].scoreDifference).toBeCloseTo(0.03);
    value.answers.relevance.score = 3.1;
    expect(() => validateResponse(rounded, value)).toThrow("outside the requested rubric's range");
  });

  it("does not apply two-decimal rounding slack to higher precision probabilities", () => {
    const value = reply();
    if (value.answers.title.type === "choice") value.answers.title.probabilities = { original: 0.102345, clean: 0.902345 };
    expect(() => validateResponse(request, value)).toThrow("incompatible with a normalized distribution");
  });

  it("retries 429 and 529 with backoff, retaining conservative charges for failed requests", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not saved", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response("not saved", { status: 529 }))
      .mockResolvedValueOnce(response());
    const live = client(fetchImpl);
    const result = live.evaluate(request);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    const record = await result;
    expect(record.attempts).toBe(3);
    expect(record.costUsd).toBeCloseTo(2 * estimateReservationUsd(request) + 0.0000042, 10);
    expect(live.stats.reservedUsd).toBe(0);
  });

  it("caps retry-after waits and performs no more than three network attempts", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("", { status: 503, headers: { "retry-after": "3600" } }));
    const result = client(fetchImpl).evaluate(request).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await result).toMatchObject({ code: "HTTP_ERROR" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403])("stops immediately and prevents further calls after HTTP %i", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(`echo ${API_KEY}`, { status }));
    const live = client(fetchImpl);
    await expect(live.evaluate(request)).rejects.toMatchObject({ code: "AUTH_ERROR" });
    await expect(live.evaluate(otherRequest())).rejects.toMatchObject({ code: "AUTH_ERROR" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(cacheDir, "budget-ledger.json"), "utf8")).not.toContain(API_KEY);
  });

  it("aborts stalled requests at 30 seconds, retries twice, and suppresses sensitive exception text", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error(`network echo ${API_KEY}`)));
    }));
    const result = client(fetchImpl).evaluate(request).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: "NETWORK_ERROR" });
    expect(String(await result)).not.toContain(API_KEY);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("enforces cumulative budget across new clients and conservatively charges uncertain failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 400 }));
    const first = client(fetchImpl, { budgetUsd: 0.004 });
    await expect(first.evaluate(request)).rejects.toMatchObject({ code: "HTTP_ERROR" });
    const resumed = client(fetchImpl); // A larger requested cap cannot reset the saved limit.
    await expect(resumed.evaluate(otherRequest())).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(resumed.stats.spentUsd).toBe(estimateReservationUsd(request));
  });

  it("checks the remaining budget again before retrying an uncertain request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error(`socket failure ${API_KEY}`));
    const live = client(fetchImpl, { budgetUsd: 0.004 });
    const result = live.evaluate(request).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(live.stats.spentUsd).toBeLessThan(0.004);
    expect(live.stats.reservedUsd).toBe(0);
  });

  it("reserves before concurrent fetches and deduplicates identical requests", async () => {
    let complete!: (value: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolveResponse) => { complete = resolveResponse; }));
    const live = client(fetchImpl, { budgetUsd: 0.004 });
    const first = live.evaluate(request);
    const duplicate = live.evaluate(request);
    await expect(client(fetchImpl).evaluate(otherRequest())).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(live.stats.reservedUsd).toBe(estimateReservationUsd(request));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    complete(response());
    expect(await duplicate).toEqual(await first);
    expect(live.stats.reservedUsd).toBe(0);
  });

  it("retains interrupted reservations and refuses corrupt spending history", async () => {
    writeFileSync(join(cacheDir, "budget-ledger.json"), JSON.stringify({ version: 1, budgetUsd: 0.004, spentUsd: 0, inputTokens: 0, outputTokens: 0, networkRequests: 1, reservations: { interrupted: 0.003 } }));
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).evaluate(request)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(fetchImpl).not.toHaveBeenCalled();
    writeFileSync(join(cacheDir, "budget-ledger.json"), "corrupt");
    expect(() => client(fetchImpl)).toThrow(/refusing to reset/);
  });

  it("rejects credentials in input and unsupported models before spending or saving", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const live = client(fetchImpl);
    await expect(live.evaluate({ ...request, state: API_KEY })).rejects.toMatchObject({ code: "SECRET_IN_INPUT" });
    await expect(live.evaluate({ ...request, model: "unpriced-model" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readdirSync(cacheDir)).toEqual([]);
  });
});
