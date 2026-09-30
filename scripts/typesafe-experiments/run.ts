import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { TypeSafeClient } from "./api";
import { captureCorpus, baselineKeywords, baselinePalette, discoveryMetrics, discoveryRequests, rankDiscovery,
  type DiscoveryCorpus, type DiscoveryQuery, type DiscoveryMetrics } from "./discovery";
import { buildQualityCases, qualityBaseline, qualityRequest, qualityPrediction, qualityMetrics, qualityConfidenceCoverage,
  QUALITY_FLAGS, type QualityCase, type QualityPrediction } from "./quality";
import { fingerprint, latencySummary, mapConcurrent } from "./evaluation";
import { MODEL, type EvaluationRecord, type Variant } from "./types";

const querySchema = z.object({
  id: z.string().min(1), text: z.string().min(1),
  category: z.enum(["control", "descriptive", "constraint", "no-match"]),
  split: z.enum(["development", "holdout"]),
  relevance: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.null()])),
  hardConstraints: z.object({ runtimeMin: z.number().optional(), runtimeMax: z.number().optional(),
    yearMin: z.number().optional(), yearMax: z.number().optional(), genre: z.string().optional(),
    window: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).optional(),
  }).optional(),
}).strict();

function read<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
function save(path: string, value: unknown) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
let releaseLock: (() => void) | undefined;
function average(values: (number | null)[]) {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? measured.reduce((sum, n) => sum + n, 0) / measured.length : null;
}

function aggregateDiscovery(rows: { queryId: string; category: string; metrics: DiscoveryMetrics }[]) {
  const summarize = (subset: typeof rows) => ({
    queries: subset.length, ndcg5: average(subset.map(r => r.metrics.ndcg5)),
    top3Relevance: average(subset.map(r => r.metrics.top3Relevance)),
    noMatchAccuracy: average(subset.map(r => r.metrics.noMatchCorrect === null ? null : Number(r.metrics.noMatchCorrect))),
    constraintViolations: subset.reduce((n, r) => n + r.metrics.hardConstraintViolations, 0),
    unscoredResults: subset.reduce((n, r) => n + r.metrics.unscoredResults, 0),
  });
  return { ...summarize(rows), byCategory: Object.fromEntries(["control", "descriptive", "constraint", "no-match"]
    .map(category => [category, summarize(rows.filter(r => r.category === category))])) };
}

function qualityAssertionAccuracy(cases: QualityCase[], predictions: QualityPrediction[]) {
  const byId = new Map(predictions.map(p => [p.id, p]));
  let correct = 0, total = 0;
  for (const item of cases) {
    const prediction = byId.get(item.id);
    if (!prediction) continue;
    if (item.titleScorable) { total++; correct += Number(item.expected.extractedTitle === prediction.extractedTitle); }
    for (const flag of QUALITY_FLAGS) if (item.expected[flag] !== null) {
      total++; correct += Number(item.expected[flag] === prediction[flag]);
    }
  }
  return total ? correct / total : 0;
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: "string", default: "scripts/typesafe-experiments/runs/2026-09-21" },
    experiment: { type: "string", default: "all" }, phase: { type: "string", default: "development" },
  } });
  const mode = positionals[0];
  if (!["capture", "baseline", "live", "report"].includes(mode)) {
    throw new Error("Usage: node --import tsx scripts/typesafe-experiments/run.ts capture|baseline|live|report [--out DIR] [--experiment quality|discovery|all] [--phase development|holdout|stability]");
  }
  if (!["all", "quality", "discovery"].includes(values.experiment!)) throw new Error("Invalid experiment");
  if (!["development", "holdout", "stability"].includes(values.phase!)) throw new Error("Invalid phase");
  const out = resolve(values.out!);
  mkdirSync(out, { recursive: true });
  const path = (name: string) => join(out, name);
  if (mode === "capture") {
    if (existsSync(path("corpus.json"))) throw new Error("Corpus already exists; choose a new --out directory to recapture.");
    const corpus = await captureCorpus(path("corpus.json"));
    console.log(JSON.stringify({ films: corpus.films.length, excluded: corpus.exclusions.length }));
    return;
  }
  const corpus = read<DiscoveryCorpus>(path("corpus.json"));
  const queries: DiscoveryQuery[] = z.array(querySchema).parse(read(path("queries.json")));
  if (new Set(queries.map(q => q.id)).size !== queries.length) throw new Error("Duplicate query IDs");
  if (queries.length !== 32 || queries.filter(q => q.split === "development").length !== 8) throw new Error("Expected 32 queries with 8 development queries");
  for (const [category, total, development] of [["control", 8, 2], ["descriptive", 16, 4], ["constraint", 4, 1], ["no-match", 4, 1]] as const) {
    const group = queries.filter(q => q.category === category);
    if (group.length !== total || group.filter(q => q.split === "development").length !== development) throw new Error(`Unexpected ${category} split`);
  }
  const ids = new Set(corpus.films.map(f => f.id));
  for (const query of queries) {
    if (Object.keys(query.relevance).length !== ids.size || Object.keys(query.relevance).some(id => !ids.has(id))) {
      throw new Error(`Query ${query.id} must explicitly label every corpus film, using null for uncertainty.`);
    }
  }
  const cases = buildQualityCases();
  const manifest = { version: 1, model: MODEL, baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    corpusHash: fingerprint(corpus), queryHash: fingerprint(queries), qualityHash: fingerprint(cases),
    requestDesignHash: fingerprint((["v1", "v2"] as const).map(variant => ({
      quality: cases.map(item => qualityRequest(item, variant)),
      discovery: queries.flatMap(query => discoveryRequests(corpus, query, variant)),
    }))),
  };
  if (existsSync(path("manifest.json"))) {
    if (fingerprint(read(path("manifest.json"))) !== fingerprint(manifest)) throw new Error("Frozen inputs changed. Use a new run directory.");
  } else {
    if (mode !== "baseline") throw new Error("Run baseline first to freeze the benchmark before inference.");
    save(path("manifest.json"), manifest);
    save(path("quality-cases.json"), cases);
  }
  const forQueries = (split: "development" | "holdout") => queries.filter(q => q.split === split);
  const forCases = (split: "development" | "holdout") => cases.filter(c => c.split === split);
  if (mode === "baseline") {
    const result = Object.fromEntries((["development", "holdout"] as const).map(split => {
      const splitCases = forCases(split), splitQueries = forQueries(split);
      const discovery = Object.fromEntries((["palette", "keywords"] as const).map(method => {
        const rows = splitQueries.map(query => {
          const ranking = (method === "palette" ? baselinePalette : baselineKeywords)(corpus, query);
          return { queryId: query.id, category: query.category, ranking, metrics: discoveryMetrics(corpus, query, ranking) };
        });
        return [method, { summary: aggregateDiscovery(rows), rows }];
      }));
      const predictions = splitCases.map(qualityBaseline);
      return [split, { quality: { metrics: qualityMetrics(splitCases, predictions), predictions }, discovery }];
    }));
    save(path("baseline.json"), result);
    console.log(JSON.stringify({ frozen: manifest, qualityCases: cases.length, discoveryQueries: queries.length, films: corpus.films.length }));
    return;
  }
  const lockPath = path(".run.lock");
  const lockFd = openSync(lockPath, "wx", 0o600);
  writeFileSync(lockFd, String(process.pid));
  releaseLock = () => { closeSync(lockFd); unlinkSync(lockPath); releaseLock = undefined; };
  const client = new TypeSafeClient({ cacheDir: path("cache"), mode: mode === "report" ? "replay" : "live", budgetUsd: 5 });
  let completed = 0;
  const evaluate = async (request: Parameters<TypeSafeClient["evaluate"]>[0]) => {
    const result = await client.evaluate(request);
    completed++;
    if (completed % 20 === 0) console.log(JSON.stringify({ completed, ...client.stats }));
    return result;
  };
  async function runQuality(selected: QualityCase[], variant: Variant, reverse = false) {
    const records = await mapConcurrent(selected, item => evaluate(qualityRequest(item, variant, reverse)));
    const predictions = selected.map((item, i) => qualityPrediction(item, records[i]));
    return { variant, metrics: qualityMetrics(selected, predictions), predictions,
      assertionAccuracy: qualityAssertionAccuracy(selected, predictions),
      confidenceCoverage: qualityConfidenceCoverage(selected, predictions),
      usage: latencySummary(records), recordKeys: records.map(r => r.key) };
  }
  async function runDiscovery(selected: DiscoveryQuery[], variant: Variant, minimumScore: number, reverse = false) {
    const tasks = selected.flatMap(query => discoveryRequests(corpus, query, variant).map(request => {
      if (reverse && request.state && typeof request.state === "object" && !Array.isArray(request.state)
        && Array.isArray(request.state.films)) request.state.films.reverse();
      return { queryId: query.id, request };
    }));
    const records = await mapConcurrent(tasks, task => evaluate(task.request));
    const recordsByQuery = new Map<string, EvaluationRecord[]>();
    tasks.forEach((task, i) => recordsByQuery.set(task.queryId, [...(recordsByQuery.get(task.queryId) ?? []), records[i]]));
    const thresholdRows = (threshold: number) => selected.map(query => {
      const ranking = rankDiscovery(corpus, query, recordsByQuery.get(query.id) ?? [], { minimumScore: threshold });
      return { queryId: query.id, category: query.category, ranking, metrics: discoveryMetrics(corpus, query, ranking) };
    });
    const rows = thresholdRows(minimumScore);
    return { variant, minimumScore, summary: aggregateDiscovery(rows), rows,
      thresholds: [1, 1.5, 2, 2.5].map(threshold => ({ threshold, summary: aggregateDiscovery(thresholdRows(threshold)) })),
      usage: latencySummary(records), recordKeys: records.map(r => r.key) };
  }
  const enabled = (experiment: string) => values.experiment === "all" || values.experiment === experiment;
  if (values.phase === "development") {
    if (enabled("quality")) {
      const results = [];
      for (const variant of ["v1", "v2"] as const) results.push(await runQuality(forCases("development"), variant));
      results.sort((a, b) => b.assertionAccuracy - a.assertionAccuracy || a.metrics.harmfulStripping - b.metrics.harmfulStripping || a.variant.localeCompare(b.variant));
      save(path("quality-development.json"), results);
      const qualifyingThresholds = results[0].confidenceCoverage.filter(row => row.titleScored >= 20 && (row.titleAccuracy ?? 0) >= 0.95 && row.harmfulStripping === 0)
        .sort((a, b) => (b.coverage ?? 0) - (a.coverage ?? 0) || a.threshold - b.threshold);
      const lock = { ...manifest, variant: results[0].variant, minimumConfidence: qualifyingThresholds[0]?.threshold ?? null,
        selection: "highest development assertion accuracy; ties: least harmful stripping, then v1",
        thresholdSelection: "greatest coverage with >=20 scored titles, >=95% title accuracy and no harmful stripping on development; null if none qualifies" };
      lockSelection("quality-lock.json", lock);
      console.log(JSON.stringify({ experiment: "quality", selected: lock.variant, results: results.map(r => ({ variant: r.variant, accuracy: r.assertionAccuracy, titleAccuracy: r.metrics.titleAccuracy })) }));
    }
    if (enabled("discovery")) {
      const results = [];
      for (const variant of ["v1", "v2"] as const) results.push(await runDiscovery(forQueries("development"), variant, 1.5));
      const choices = results.flatMap(r => r.thresholds.map(t => ({ variant: r.variant, threshold: t.threshold,
        objective: 0.8 * (t.summary.ndcg5 ?? 0) + 0.2 * (t.summary.noMatchAccuracy ?? 0) })));
      choices.sort((a, b) => b.objective - a.objective || b.threshold - a.threshold || a.variant.localeCompare(b.variant));
      save(path("discovery-development.json"), results);
      const lock = { ...manifest, variant: choices[0].variant, minimumScore: choices[0].threshold,
        selection: "maximize 0.8*nDCG5 + 0.2*empty/nonempty accuracy on development; ties: higher threshold, then v1" };
      lockSelection("discovery-lock.json", lock);
      console.log(JSON.stringify({ experiment: "discovery", selected: lock }));
    }
  } else {
    const split = "holdout";
    const stability = values.phase === "stability";
    if (enabled("quality")) {
      const lock = read<typeof manifest & { variant: Variant; minimumConfidence: number | null }>(path("quality-lock.json"));
      assertLock(lock);
      const selected = stability ? forCases(split).slice(0, 12) : forCases(split);
      const result = await runQuality(selected, lock.variant, stability);
      save(path(stability ? "quality-stability.json" : "quality-holdout.json"), { ...result,
        lockedThreshold: lock.minimumConfidence,
        acceptedMetrics: lock.minimumConfidence === null ? null : qualityMetrics(selected, result.predictions.filter(p => p.confidence >= lock.minimumConfidence!)),
      });
    }
    if (enabled("discovery")) {
      const lock = read<typeof manifest & { variant: Variant; minimumScore: number }>(path("discovery-lock.json"));
      assertLock(lock);
      const selected = stability ? forQueries(split).filter(q => q.category === "descriptive").slice(0, 2) : forQueries(split);
      save(path(stability ? "discovery-stability.json" : "discovery-holdout.json"), await runDiscovery(selected, lock.variant, lock.minimumScore, stability));
    }
  }
  save(path("usage.json"), client.stats);
  console.log(JSON.stringify({ mode, phase: values.phase, evaluated: completed, ...client.stats }));

  function assertLock(lock: typeof manifest) {
    for (const key of Object.keys(manifest) as (keyof typeof manifest)[]) if (lock[key] !== manifest[key]) throw new Error("Locked benchmark inputs do not match");
  }
  function lockSelection(name: string, lock: unknown) {
    if (existsSync(path(name)) && fingerprint(read(path(name))) !== fingerprint(lock)) throw new Error("Development selection changed after it was locked");
    save(path(name), lock);
  }
}

main().catch(error => {
  // Transport errors contain only sanitized status/messages; never log request headers.
  console.error(error instanceof Error ? error.message : "Experiment failed");
  process.exitCode = 1;
}).finally(() => releaseLock?.());
process.once("exit", () => releaseLock?.());
