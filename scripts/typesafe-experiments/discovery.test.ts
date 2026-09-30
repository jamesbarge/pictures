// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  baselineKeywords, baselinePalette, captureCorpus, discoveryMetrics, discoveryRequests,
  meetsConstraints, rankDiscovery, sampleCatalog,
  type DiscoveryCorpus, type DiscoveryFilm, type DiscoveryQuery,
} from "./discovery";
import { MODEL, type EvaluationRecord, type EvaluationRequest } from "./types";

const NOW = "2026-09-21T12:00:00.000Z";
const FUTURE = "2026-09-23T19:00:00.000Z";
const film = (id: string, overrides: Partial<DiscoveryFilm> = {}): DiscoveryFilm => ({
  id, title: id === "a" ? "Amélie" : `Film ${id}`, year: 2001, runtime: 90,
  directors: ["Jean-Pierre Jeunet"], genres: ["Comedy"], synopsis: "A shy Paris waitress secretly helps her neighbours.",
  countries: ["France"], languages: ["French"], contentType: "film",
  screenings: [{ id: `screening-${id}`, datetime: FUTURE, cinemaId: "cinema", cinemaName: "Public cinema", availabilityStatus: "available" }],
  sourceUrl: `https://api.pictures.london/api/films/${id}`, capturedAt: NOW, ...overrides,
});
const corpus = (films: DiscoveryFilm[] = [film("a"), film("b", { title: "The Lighthouse", year: 2019, runtime: 109, directors: ["Robert Eggers"], genres: ["Horror"], synopsis: "Two isolated lighthouse keepers descend into madness." })]): DiscoveryCorpus => ({
  version: 1, capturedAt: NOW, completedAt: NOW,
  catalog: { url: "https://api.pictures.london/api/search/catalog", generatedAt: NOW, films: films.map((item) => ({ id: item.id, title: item.title, year: item.year, directors: item.directors, posterUrl: null })) },
  sampling: { target: 80, maxDetails: 120, detailRequests: films.length, method: "test" }, films, exclusions: [],
});
const query = (overrides: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({
  id: "query-a", text: "A shy woman helping neighbours in Paris", category: "descriptive", split: "development",
  relevance: { a: 3, b: 0 }, ...overrides,
});
const record = (request: EvaluationRequest, scores: Record<string, number>): EvaluationRecord => ({
  key: "test", request, response: { model: MODEL, answers: Object.fromEntries(Object.entries(scores).map(([id, score]) => [`film_${id}`, { type: "score", score, confidence: 1, probabilities: { "0": 1 }, legend: { "0": "test" } }])), usage: { input_tokens: 10, output_tokens: 10 } },
  elapsedMs: 10, attempts: 1, costUsd: 0.001, cached: false,
});

describe("discovery requests and rankings", () => {
  it("never sends relevance judgments, query category, or split and scores all films in batches", () => {
    const sample = corpus(Array.from({ length: 17 }, (_, index) => film(String(index))));
    const first = query({ hardConstraints: { runtimeMax: 100 } });
    const requests = discoveryRequests(sample, first, "v1");
    expect(requests.map((request) => Object.keys(request.questions).length)).toEqual([8, 8, 1]);
    expect(requests[0].state).toMatchObject({ hardConstraints: { runtimeMax: 100 } });
    expect(discoveryRequests(sample, { ...first, id: "secret-label-id", category: "no-match", split: "holdout", relevance: { "secret-gold-id": 0 } }, "v1")).toEqual(requests);
    expect(JSON.stringify(requests)).not.toMatch(/relevance|holdout|development|secret-gold-id|secret-label-id|sourceUrl|capturedAt/);
    expect(() => discoveryRequests(sample, first, "v1", 0)).toThrow("positive integer");
  });

  it("uses the same score scale for both prompt variants", () => {
    const v1 = discoveryRequests(corpus(), query(), "v1")[0];
    const v2 = discoveryRequests(corpus(), query(), "v2")[0];
    expect(v1.questions.film_a.criteria).toEqual(v2.questions.film_a.criteria);
    expect(v1.questions.film_a.instructions).not.toEqual(v2.questions.film_a.instructions);
    expect(v2.questions.film_a.instructions).toContain("outside knowledge");
  });

  it("uses actual accent-aware fuzzy palette search and synopsis keyword baseline", () => {
    const sample = corpus();
    expect(baselinePalette(sample, query({ text: "amelei" }))[0].filmId).toBe("a");
    expect(baselinePalette(sample, query({ text: "Robert Eggers" }))[0].filmId).toBe("b");
    expect(baselineKeywords(sample, query({ text: "isolated lighthouse keepers" }))).toEqual([{ filmId: "b", score: 1 }]);
    expect(baselineKeywords(sample, query({ text: "the a movie" }))).toEqual([]);
    expect(baselineKeywords(sample, query({ text: "with Spanish subtitles" }))).toEqual([]);
  });

  it("enforces runtime, year, genre, and inclusive screening-window constraints", () => {
    const candidate = film("a");
    expect(meetsConstraints(candidate, { runtimeMin: 90, runtimeMax: 90, yearMin: 2001, yearMax: 2001, genre: "comedy", window: { from: FUTURE, to: FUTURE } })).toBe(true);
    for (const hardConstraints of [
      { runtimeMin: 91 }, { runtimeMax: 89 }, { yearMin: 2002 }, { yearMax: 2000 }, { genre: "Horror" },
      { window: { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" } },
    ]) expect(meetsConstraints(candidate, hardConstraints)).toBe(false);
    expect(meetsConstraints(film("a", { year: null }), { yearMin: 1900 })).toBe(false);
  });

  it("applies identical hard filters to all methods, then ranks scores with a stable ID tie-break", () => {
    const sample = corpus([film("b"), film("a"), film("c", { runtime: 110 })]);
    const constrained = query({ text: "Jean-Pierre Jeunet", hardConstraints: { runtimeMax: 100 } });
    const request = discoveryRequests(sample, constrained, "v1")[0];
    const answers = record(request, { b: 3, a: 3, c: 3 });
    expect(rankDiscovery(sample, constrained, [answers])).toEqual([{ filmId: "a", score: 3 }, { filmId: "b", score: 3 }]);
    expect(baselinePalette(sample, constrained).map((item) => item.filmId)).not.toContain("c");
    expect(baselineKeywords(sample, constrained).map((item) => item.filmId)).not.toContain("c");
    expect(rankDiscovery(sample, constrained, [record(request, { a: 1 })])).toEqual([]);
    expect(rankDiscovery(sample, constrained, [record(request, { a: 1 })], { minimumScore: 1 })).toEqual([{ filmId: "a", score: 1 }]);
    expect(rankDiscovery(sample, query({ text: "a different request" }), [answers])).toEqual([]);
  });
});

describe("discovery metrics", () => {
  it("computes nDCG@5, top-three graded relevance, and no-match accuracy", () => {
    const sample = corpus([film("a"), film("b"), film("c")]);
    const labels = query({ relevance: { a: 3, b: 2, c: 0 } });
    const ideal = discoveryMetrics(sample, labels, [{ filmId: "a", score: 3 }, { filmId: "b", score: 2 }]);
    expect(ideal.ndcg5).toBe(1);
    expect(ideal.top3Relevance).toBe(2.5);
    expect(ideal.top3RelevantCount).toBe(2);
    expect(ideal.noMatchCorrect).toBe(true);
    const reversed = discoveryMetrics(sample, labels, [{ filmId: "b", score: 3 }, { filmId: "a", score: 2 }]);
    expect(reversed.ndcg5).toBeLessThan(1);
    expect(discoveryMetrics(sample, labels, []).ndcg5).toBe(0);
    expect(discoveryMetrics(sample, labels, []).noMatchCorrect).toBe(false);
    const none = query({ relevance: { a: 0, b: 0, c: 0 } });
    expect(discoveryMetrics(sample, none, []).noMatchCorrect).toBe(true);
    expect(discoveryMetrics(sample, none, []).ndcg5).toBeNull();
    expect(discoveryMetrics(sample, none, [{ filmId: "c", score: 2 }]).noMatchCorrect).toBe(false);
  });

  it("leaves uncertain judgments unscored and reports constraint violations", () => {
    const sample = corpus();
    const labels = query({ relevance: { a: 3, b: null }, hardConstraints: { runtimeMax: 100 } });
    const metrics = discoveryMetrics(sample, labels, [{ filmId: "b", score: 3 }, { filmId: "a", score: 2 }]);
    expect(metrics.unscoredResults).toBe(1);
    expect(metrics.top3Relevance).toBe(3);
    expect(metrics.ndcg5).toBe(1);
    expect(metrics.hardConstraintViolations).toBe(1);
    expect(discoveryMetrics(sample, query({ relevance: { a: 3, b: null } }), []).noMatchCorrect).toBeNull();
  });
});

describe("public corpus capture", () => {
  const directories: string[] = [];
  afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

  const detail = (item: DiscoveryFilm) => ({ film: item, screenings: item.screenings.map((screening) => ({ ...screening, cinema: { id: screening.cinemaId, name: screening.cinemaName } })) });
  const outputPath = async () => {
    const directory = await mkdtemp(join(tmpdir(), "typesafe-discovery-test-"));
    directories.push(directory);
    return join(directory, "snapshot.json");
  };

  it("samples each decade before returning to one, independently of input order", () => {
    const films = corpus([film("a", { year: 1960 }), film("b", { year: 1969 }), film("c", { year: 2001 }), film("d", { year: null })]).catalog.films;
    const ordered = sampleCatalog(films);
    expect(ordered.slice(0, 3).map((item) => item.year === null ? null : Math.floor(item.year / 10) * 10)).toEqual([1960, 2000, null]);
    expect(sampleCatalog([...films].reverse())).toEqual(ordered);
    expect(sampleCatalog([...films, films[0]])).toHaveLength(4);
  });

  it("records provenance, exclusions, future screening evidence, and no private fields", async () => {
    const good = film("good", { year: 1920 });
    const incomplete = film("incomplete", { year: 1930, synopsis: "" });
    const expired = film("expired", { year: 1940, screenings: [{ ...good.screenings[0], datetime: "2020-01-01T00:00:00Z" }] });
    const event = film("event", { year: 1950 });
    const sample = corpus([good, incomplete, expired, event]);
    const details = Object.fromEntries(sample.films.map((item) => [item.id, detail(item)]));
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const id = String(url).split("/").pop()!;
      return Response.json(id === "catalog" ? sample.catalog : {
        ...details[id], film: { ...details[id].film, contentType: id === "event" ? "event" : "film", internalSecret: "not public experiment data" },
      });
    });
    const sleep = vi.fn(async () => undefined);
    const path = await outputPath();
    const captured = await captureCorpus(path, { fetchImpl: fetchMock, now: () => new Date(NOW), sleep });
    expect(captured.films.map((item) => item.id)).toEqual(["good"]);
    expect(captured.catalog.generatedAt).toBe(NOW);
    expect(captured.sampling.detailRequests).toBe(4);
    expect(captured.exclusions.map((item) => item.reason)).toEqual(["missing synopsis", "no future screening at capture time", "contentType is not film"]);
    expect(captured.films[0].screenings[0].availabilityStatus).toBe("available");
    expect(captured.films[0].sourceUrl).toBe("https://api.pictures.london/api/films/good");
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(captured);
    expect(JSON.stringify(captured)).not.toContain("internalSecret");
  });

  it("caps detail requests even when all records are ineligible and preserves errors", async () => {
    const sample = corpus([film("a", { year: 1920 }), film("b", { year: 1930 }), film("c", { year: 1940 })]);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("catalog")) return Response.json(sample.catalog);
      if (String(url).endsWith("a")) return new Response("unavailable", { status: 503 });
      throw new TypeError("network failure");
    });
    const captured = await captureCorpus(await outputPath(), { fetchImpl: fetchMock, now: () => new Date(NOW), sleep: async () => undefined, maxDetails: 4 });
    expect(captured.sampling.detailRequests).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(captured.exclusions.map((item) => item.reason)).toEqual(["HTTP 503", "TypeError"]);
    expect(captured.films).toEqual([]);
  });

  it("honors Retry-After, caps attempts at three, and stops capture on persistent throttling", async () => {
    const sample = corpus();
    const fetchMock = vi.fn(async (url: string | URL | Request) => String(url).endsWith("catalog")
      ? Response.json(sample.catalog)
      : new Response("rate limited", { status: 429, headers: { "retry-after": "7" } }));
    const sleep = vi.fn(async () => undefined);
    const captured = await captureCorpus(await outputPath(), { fetchImpl: fetchMock, now: () => new Date(NOW), sleep });
    expect(captured.sampling.detailRequests).toBe(3);
    expect(sleep.mock.calls).toEqual([[1_000], [7_000], [7_000]]);
    expect(captured.exclusions).toHaveLength(1);
    expect(captured.exclusions[0].reason).toBe("HTTP 429");
  });
});
