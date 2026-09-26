import { describe, expect, it } from "vitest";
import { buildQualityCases, qualityBaseline, qualityCandidates, qualityConfidenceCoverage,
  qualityMetrics, qualityPrediction, qualityRequest, type QualityCase, type QualityPrediction } from "./quality";
import type { EvaluationRecord } from "./types";

const cases = buildQualityCases();
const find = (id: string) => cases.find((item) => item.id === id)!;
const perfect = (item: QualityCase): QualityPrediction => ({ id: item.id,
  extractedTitle: item.expected.extractedTitle, isCompilation: item.expected.isCompilation ?? false,
  isLiveBroadcast: item.expected.isLiveBroadcast ?? false, isNonFilm: item.expected.isNonFilm ?? false, confidence: 0.95 });

describe("quality benchmark provenance and splits", () => {
  it("includes all 100 observed wrappers while labeling generated listings synthetic", () => {
    const prefixes = cases.filter(({ id }) => id.startsWith("prefix-"));
    const suffixes = cases.filter(({ id }) => id.startsWith("suffix-"));
    expect(prefixes).toHaveLength(74);
    expect(suffixes).toHaveLength(26);
    expect([...prefixes, ...suffixes].every(({ provenance }) => provenance === "synthetic")).toBe(true);
    expect(cases.some(({ provenance }) => provenance === "production-fixture")).toBe(true);
    expect(cases.some(({ provenance }) => provenance === "behavioral-fixture")).toBe(true);
    expect(new Set(cases.map(({ id }) => id)).size).toBe(cases.length);
  });

  it("keeps every pattern family in exactly one stable split", () => {
    const families = new Map<string, Set<string>>();
    for (const item of cases) families.set(item.family, new Set([...(families.get(item.family) ?? []), item.split]));
    expect([...families.values()].every((splits) => splits.size === 1)).toBe(true);
    expect(new Set(cases.map(({ split }) => split))).toEqual(new Set(["development", "holdout"]));
    expect(cases.filter(({ split }) => split === "holdout")).toHaveLength(Math.round(cases.length / 3));
    expect(buildQualityCases()).toEqual(cases);
    const variants = cases.filter(({ source }) => /^Relaxed [Ss]creening:/.test(source));
    expect(new Set(variants.map(({ split }) => split)).size).toBe(1);
  });

  it("does not convert ambiguous fixtures and deliberate policy differences into baseline failures", () => {
    const ambiguous = cases.find(({ source }) => source.startsWith("Funday Workshop:"))!;
    expect(ambiguous.titleScorable).toBe(false);
    expect(ambiguous.expected.isNonFilm).toBeNull();
    expect(find("double-0").titleScorable).toBe(false);
    expect(qualityBaseline(find("event-0")).extractedTitle).toBeNull();
    expect(qualityMetrics([find("double-0")], [qualityBaseline(find("double-0"))]).titleScored).toBe(0);
  });
});

describe("source-only candidates and requests", () => {
  it.each([
    ["2001: A Space Odyssey", "2001: A Space Odyssey"],
    ["Member Picks: 2001: A Space Odyssey", "2001: A Space Odyssey"],
    ["Daisies (Sedmikrásky) (4K Restoration)", "Daisies (Sedmikrásky)"],
    ["The Godfather Part II + Q&A", "The Godfather Part II"],
    ['Funeral Parade presents "A Star Is Born (1954)"', "A Star Is Born (1954)"],
    ["Classic Matinee: Singin&#39; in the Rain", "Singin' in the Rain"],
  ])("retains critical title spans from %s", (source, expected) => {
    expect(qualityCandidates(source).map(({ title }) => title)).toContain(expected);
  });

  it("never injects gold labels, provenance, split, or notes into a request", () => {
    const item = find("production-0");
    const changed: QualityCase = { ...item, id: "SECRET_ID", split: item.split === "holdout" ? "development" : "holdout",
      family: "SECRET_FAMILY", provenance: "synthetic", note: "SECRET_NOTE", titleScorable: false,
      expected: { extractedTitle: "SECRET_ANSWER", isCompilation: true, isLiveBroadcast: true, isNonFilm: true } };
    expect(qualityRequest(changed, "v1")).toEqual(qualityRequest(item, "v1"));
    expect(JSON.stringify(qualityRequest(changed, "v2"))).not.toContain("SECRET");
    expect(qualityCandidates(changed.source).some(({ title }) => title === "SECRET_ANSWER")).toBe(false);
  });

  it("offers no-match and preserves candidate IDs under reversed ordering", () => {
    const item = find("behavior-0");
    const regular = qualityRequest(item, "v1");
    const reversed = qualityRequest(item, "v1", true);
    expect(regular.questions.pick.type).toBe("choice");
    if (regular.questions.pick.type !== "choice" || reversed.questions.pick.type !== "choice") throw new Error("choice expected");
    expect(regular.questions.pick.criteria.none).toBeDefined();
    expect(reversed.questions.pick.criteria).toEqual(regular.questions.pick.criteria);
    expect(Object.keys(regular.questions)).toEqual(["pick", "isCompilation", "isLiveBroadcast", "isNonFilm"]);
    expect(regular).not.toEqual(reversed);
  });

  it("treats impossible normalization as candidate coverage failure, not a model mistake", () => {
    const item = find("production-9");
    expect(qualityCandidates(item.source).some(({ title }) => title === "Daddy")).toBe(false);
    const metrics = qualityMetrics([item], [qualityBaseline(item)]);
    expect(metrics.candidateCoverage).toBe(0);
    expect(metrics.errors[0].cause).toBe("candidate-missing");
  });
});

describe("prediction and scoring", () => {
  const record = (item: QualityCase, choice: string): EvaluationRecord => ({
    key: "fake", request: qualityRequest(item, "v1"), elapsedMs: 1, attempts: 1, costUsd: 0, cached: true,
    response: { model: "jev-1.13.0", usage: { input_tokens: 1, output_tokens: 1 }, answers: {
      pick: { type: "choice", choice, confidence: 0.9, probabilities: { [choice]: 0.9 } },
      isCompilation: { type: "noul", noul: 0.8 }, isLiveBroadcast: { type: "noul", noul: 0.2 },
      isNonFilm: { type: "noul", noul: 0.1 },
    } },
  });

  it("maps choices independently of expected answers and rejects unknown IDs or missing flags", () => {
    const item = find("behavior-0");
    const prediction = qualityPrediction(item, record(item, "none"));
    expect(prediction.extractedTitle).toBeNull();
    expect(prediction.isCompilation).toBe(true);
    expect(prediction.isLiveBroadcast).toBe(false);
    expect(() => qualityPrediction(item, record(item, "unknown"))).toThrow("Unknown title candidate");
    const missing = record(item, "t0");
    delete missing.response.answers.isNonFilm;
    expect(() => qualityPrediction(item, missing)).toThrow("Missing isNonFilm");
  });

  it("separates missing responses, unsafe title stripping, and classification precision/recall", () => {
    const protectedCase = find("protected-0");
    const eventCase = find("event-0");
    const absent = find("behavior-0");
    const metrics = qualityMetrics([protectedCase, eventCase, absent], [
      { ...perfect(protectedCase), extractedTitle: "A Space Odyssey", isNonFilm: true },
      { ...perfect(eventCase), isNonFilm: false },
    ]);
    expect(metrics.answered).toBe(2);
    expect(metrics.missing).toBe(1);
    expect(metrics.titleAccuracy).toBe(0.5);
    expect(metrics.harmfulStripping).toBe(1);
    expect(metrics.classification.isNonFilm).toMatchObject({ tp: 0, fp: 1, fn: 1, precision: 0, recall: 0 });
  });

  it("reports null rather than fabricated certainty for empty denominators", () => {
    const metrics = qualityMetrics([], []);
    expect(metrics.titleAccuracy).toBeNull();
    expect(metrics.candidateCoverage).toBeNull();
    expect(metrics.classification.isCompilation.precision).toBeNull();
  });

  it("reports confidence coverage against the full case count", () => {
    const items = [find("behavior-0"), find("behavior-1")];
    const rows = qualityConfidenceCoverage(items, [perfect(items[0]), { ...perfect(items[1]), confidence: 0.6 }], [0, 0.9]);
    expect(rows.map(({ coverage }) => coverage)).toEqual([1, 0.5]);
    expect(rows[1].titleAccuracy).toBe(1);
  });
});
