import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { responseDiagnostics } from "./api";
import { discoveryMetrics, type DiscoveryCorpus, type DiscoveryQuery, type DiscoveryRanking } from "./discovery";
import { qualityMetrics, type QualityCase, type QualityPrediction } from "./quality";
import type { EvaluationRecord } from "./types";

interface DiscoveryOutput {
  variant?: string;
  minimumScore?: number;
  rows: { queryId: string; category: string; ranking: DiscoveryRanking[] }[];
}
interface QualityOutput { predictions: QualityPrediction[]; metrics: ReturnType<typeof qualityMetrics> }
const out = resolve(process.argv[2] ?? "scripts/typesafe-experiments/runs/2026-09-21");
const read = <T>(name: string): T => JSON.parse(readFileSync(join(out, name), "utf8")) as T;
const corpus = read<DiscoveryCorpus>("corpus.json");
const queries = read<DiscoveryQuery[]>("queries.json");
const cases = read<QualityCase[]>("quality-cases.json");
const baseline = read<Record<string, { quality: QualityOutput; discovery: Record<string, DiscoveryOutput> }>>("baseline.json");
const quality = read<QualityOutput>("quality-holdout.json");
const discovery = read<DiscoveryOutput>("discovery-holdout.json");
const qualityStability = read<QualityOutput>("quality-stability.json");
const discoveryStability = read<DiscoveryOutput>("discovery-stability.json");
const title = new Map(corpus.films.map(film => [film.id, film.title]));
const methods = { palette: baseline.holdout.discovery.palette, keywords: baseline.holdout.discovery.keywords, typesafe: discovery };

function discoverySummary(output: DiscoveryOutput, excludeDisputedQuery = false) {
  const rows = output.rows.filter(row => !excludeDisputedQuery || row.queryId !== "descriptive-12");
  const details = rows.map(row => {
    const query = queries.find(q => q.id === row.queryId)!;
    const metric = discoveryMetrics(corpus, query, row.ranking);
    return { id: query.id, text: query.text, category: query.category, ...metric,
      top1Relevant: row.ranking.length > 0 && (query.relevance[row.ranking[0].filmId] ?? 0) >= 2,
      top3: row.ranking.slice(0, 3).map(r => ({ title: title.get(r.filmId), score: r.score, relevance: query.relevance[r.filmId] })),
    };
  });
  const graded = details.filter(r => r.ndcg5 !== null);
  const descriptive = details.filter(r => r.category === "descriptive");
  return { queries: rows.length,
    ndcg5: graded.reduce((n, r) => n + r.ndcg5!, 0) / graded.length,
    descriptive: { queries: descriptive.length, top1Relevant: descriptive.filter(r => r.top1Relevant).length,
      ndcg5: descriptive.reduce((n, r) => n + (r.ndcg5 ?? 0), 0) / descriptive.length },
    rejectedNoMatch: details.filter(r => r.category === "no-match" && r.noMatchCorrect).length,
    details };
}

const qualityChanges = cases.filter(item => item.split === "holdout" && item.titleScorable).map(item => {
  const before = baseline.holdout.quality.predictions.find(p => p.id === item.id)!;
  const after = quality.predictions.find(p => p.id === item.id)!;
  return { id: item.id, source: item.source, expected: item.expected.extractedTitle, baseline: before.extractedTitle,
    typesafe: after.extractedTitle, provenance: item.provenance, family: item.family };
}).filter(row => row.baseline !== row.typesafe);
const qualityOrderChanges = qualityStability.predictions.flatMap(after => {
  const before = quality.predictions.find(p => p.id === after.id)!;
  const fields = (["extractedTitle", "isCompilation", "isLiveBroadcast", "isNonFilm"] as const).filter(key => before[key] !== after[key]);
  return fields.length ? [{ id: after.id, fields, before, after }] : [];
});
const discoveryOrder = discoveryStability.rows.map(after => {
  const before = discovery.rows.find(row => row.queryId === after.queryId)!;
  const ids = (row: typeof after) => row.ranking.map(r => r.filmId);
  return { queryId: after.queryId, sameTop1: ids(before)[0] === ids(after)[0],
    sameOrder: JSON.stringify(ids(before)) === JSON.stringify(ids(after)),
    before: before.ranking, after: after.ranking };
});
const cacheNames = readdirSync(join(out, "cache"));
const records = cacheNames.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => read<EvaluationRecord>(join("cache", name)));
const diagnostics = records.flatMap(record => responseDiagnostics(record.response).map(diagnostic => ({ key: record.key, ...diagnostic })));
const scoreDiagnostics = diagnostics.filter(row => "scoreDifference" in row && row.scoreDifference !== undefined);
const summary = {
  qualityChanges,
  discovery: Object.fromEntries(Object.entries(methods).map(([name, output]) => [name, discoverySummary(output)])),
  sensitivityExcludingDisputedHoldoutQuery: Object.fromEntries(Object.entries(methods).map(([name, output]) => [name, discoverySummary(output, true)])),
  stability: { qualityCases: qualityStability.predictions.length, qualityOrderChanges, discoveryOrder },
  apiDiagnostics: {
    cachedRequests: records.length, failureArtifacts: cacheNames.filter(name => name.startsWith("failure-")).length,
    scoreAnswers: records.flatMap(r => Object.values(r.response.answers)).filter(a => a.type === "score").length,
    discrepantScoreHistograms: scoreDiagnostics.length,
    maximumScoreDifference: Math.max(0, ...scoreDiagnostics.map(row => Math.abs(row.scoreDifference ?? 0))),
    successfulInputTokens: records.reduce((n, r) => n + r.response.usage.input_tokens, 0),
    successfulOutputTokens: records.reduce((n, r) => n + r.response.usage.output_tokens, 0),
  },
  budget: read("cache/budget-ledger.json"),
};
writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ qualityChanges: qualityChanges.length, discovery: Object.fromEntries(Object.entries(summary.discovery).map(([name, value]) => [name, { ...value, details: undefined }])), stability: summary.stability, apiDiagnostics: summary.apiDiagnostics, budget: summary.budget }, null, 2));
