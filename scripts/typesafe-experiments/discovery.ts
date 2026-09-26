import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { buildCatalogIndexes, searchCatalog } from "../../frontend/src/lib/search/catalog-index-core";
import { MODEL, type EvaluationRecord, type EvaluationRequest, type Split, type Variant } from "./types";

const PUBLIC_API = "https://api.pictures.london";
const catalogFilmSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), year: z.number().nullable(),
  directors: z.array(z.string()).default([]), posterUrl: z.string().nullable().default(null),
});
const catalogSchema = z.object({
  films: z.array(catalogFilmSchema), generatedAt: z.string().optional(),
});
const detailSchema = z.object({
  film: z.object({
    id: z.string(), title: z.string(), year: z.number().nullable(),
    runtime: z.number().nullable(), directors: z.array(z.string()), genres: z.array(z.string()),
    synopsis: z.string().nullable(), contentType: z.string().nullable(),
    countries: z.array(z.string()).default([]), languages: z.array(z.string()).default([]),
    originalTitle: z.string().nullable().optional(), tagline: z.string().nullable().optional(),
  }),
  screenings: z.array(z.object({
    id: z.string(), datetime: z.string(), availabilityStatus: z.string().nullable().optional(),
    cinema: z.object({ id: z.string(), name: z.string() }),
  })),
});

export interface DiscoveryFilm {
  id: string;
  title: string;
  originalTitle?: string | null;
  tagline?: string | null;
  year: number | null;
  runtime: number;
  directors: string[];
  genres: string[];
  synopsis: string;
  countries: string[];
  languages: string[];
  contentType: "film";
  screenings: {
    id: string; datetime: string; cinemaId: string; cinemaName: string;
    availabilityStatus: string | null;
  }[];
  sourceUrl: string;
  capturedAt: string;
}

export interface DiscoveryCorpus {
  version: 1;
  capturedAt: string;
  completedAt: string;
  catalog: { url: string; generatedAt: string | null; films: z.infer<typeof catalogFilmSchema>[] };
  sampling: { target: number; maxDetails: number; detailRequests: number; method: string };
  films: DiscoveryFilm[];
  exclusions: { id: string; reason: string; endpoint: string }[];
}

export interface DiscoveryQuery {
  id: string;
  text: string;
  category: "control" | "descriptive" | "constraint" | "no-match";
  split: Split;
  relevance: Record<string, 0 | 1 | 2 | 3 | null>;
  hardConstraints?: {
    runtimeMin?: number; runtimeMax?: number; yearMin?: number; yearMax?: number;
    genre?: string; window?: { from: string; to: string };
  };
}

export interface DiscoveryRanking {
  filmId: string;
  score: number;
}

export interface CaptureOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  target?: number;
  maxDetails?: number;
}

function hashId(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

/** Release-decade round robin avoids allowing today's releases to dominate the cohort. */
export function sampleCatalog(films: DiscoveryCorpus["catalog"]["films"]): DiscoveryCorpus["catalog"]["films"] {
  const decades = new Map<string, DiscoveryCorpus["catalog"]["films"]>();
  for (const film of new Map(films.map((film) => [film.id, film])).values()) {
    const decade = film.year === null ? "unknown" : String(Math.floor(film.year / 10) * 10);
    const bucket = decades.get(decade) ?? [];
    bucket.push(film);
    decades.set(decade, bucket);
  }
  const buckets = [...decades.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, bucket]) =>
    bucket.sort((a, b) => hashId(a.id).localeCompare(hashId(b.id))));
  const result: DiscoveryCorpus["catalog"]["films"] = [];
  for (let index = 0; buckets.some((bucket) => index < bucket.length); index++) {
    for (const bucket of buckets) if (bucket[index]) result.push(bucket[index]);
  }
  return result;
}

/** Capture public metadata only. Never reads database credentials or invokes app repositories. */
export async function captureCorpus(outputPath: string, options: CaptureOptions = {}): Promise<DiscoveryCorpus> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const target = Math.min(80, Math.max(1, options.target ?? 80));
  const maxDetails = Math.min(120, Math.max(1, options.maxDetails ?? 120));
  const capturedAt = now().toISOString();
  const catalogUrl = `${PUBLIC_API}/api/search/catalog`;
  const catalogResponse = await fetchImpl(catalogUrl, { signal: AbortSignal.timeout(30_000) });
  if (!catalogResponse.ok) throw new Error(`Public catalog request failed: HTTP ${catalogResponse.status}`);
  const catalog = catalogSchema.parse(await catalogResponse.json());
  const corpus: DiscoveryCorpus = {
    version: 1, capturedAt, completedAt: capturedAt,
    catalog: { url: catalogUrl, generatedAt: catalog.generatedAt ?? null, films: catalog.films },
    sampling: { target, maxDetails, detailRequests: 0, method: "release-decade round robin; SHA-256 film-ID order within decade" },
    films: [], exclusions: [],
  };
  async function fetchDetail(endpoint: string): Promise<Response> {
    let delay = 1_000;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Retried HTTP calls count toward the same 120-request ceiling.
      await sleep(delay);
      corpus.sampling.detailRequests++;
      try {
        const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(30_000) });
        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt === 2 || corpus.sampling.detailRequests >= maxDetails) return response;
        const retryAfter = response.headers.get("retry-after");
        const retryAfterMs = retryAfter === null ? 0 : /^\d+(?:\.\d+)?$/.test(retryAfter)
          ? Number(retryAfter) * 1_000 : Date.parse(retryAfter) - now().getTime();
        delay = Math.max(1_000 * 2 ** attempt, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
      } catch (error) {
        if (attempt === 2 || corpus.sampling.detailRequests >= maxDetails) throw error;
        delay = 1_000 * 2 ** attempt;
      }
    }
    throw new Error("Detail request retries exhausted");
  }
  for (const candidate of sampleCatalog(catalog.films)) {
    if (corpus.films.length >= target || corpus.sampling.detailRequests >= maxDetails) break;
    const endpoint = `${PUBLIC_API}/api/films/${encodeURIComponent(candidate.id)}`;
    try {
      const response = await fetchDetail(endpoint);
      if (!response.ok) {
        corpus.exclusions.push({ id: candidate.id, reason: `HTTP ${response.status}`, endpoint });
        if (response.status === 429) break;
        continue;
      }
      const parsed = detailSchema.safeParse(await response.json());
      if (!parsed.success) {
        corpus.exclusions.push({ id: candidate.id, reason: "invalid detail response shape", endpoint });
        continue;
      }
      const { film, screenings } = parsed.data;
      const futureScreenings = screenings.filter((screening) => Date.parse(screening.datetime) > Date.parse(capturedAt));
      const reasons: string[] = [];
      if (film.id !== candidate.id) reasons.push("film ID mismatch");
      if (film.contentType !== "film") reasons.push("contentType is not film");
      if (!film.title.trim()) reasons.push("missing title");
      if (!film.synopsis?.trim()) reasons.push("missing synopsis");
      if (!film.directors.some((director) => director.trim())) reasons.push("missing director");
      if (!film.genres.some((genre) => genre.trim())) reasons.push("missing genres");
      if (film.runtime === null || film.runtime <= 0) reasons.push("missing runtime");
      if (!futureScreenings.length) reasons.push("no future screening at capture time");
      if (reasons.length) {
        corpus.exclusions.push({ id: candidate.id, reason: reasons.join("; "), endpoint });
        continue;
      }
      corpus.films.push({
        ...film, runtime: film.runtime!, synopsis: film.synopsis!, contentType: "film",
        screenings: futureScreenings.map((screening) => ({
          id: screening.id, datetime: screening.datetime,
          cinemaId: screening.cinema.id, cinemaName: screening.cinema.name,
          availabilityStatus: screening.availabilityStatus ?? null,
        })), sourceUrl: endpoint, capturedAt: now().toISOString(),
      });
    } catch (error) {
      corpus.exclusions.push({ id: candidate.id, reason: error instanceof Error ? error.name : "request failure", endpoint });
    }
  }
  corpus.completedAt = now().toISOString();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);
  return corpus;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function meetsConstraints(film: DiscoveryFilm, constraints?: DiscoveryQuery["hardConstraints"]): boolean {
  if (!constraints) return true;
  if (constraints.runtimeMin !== undefined && film.runtime < constraints.runtimeMin) return false;
  if (constraints.runtimeMax !== undefined && film.runtime > constraints.runtimeMax) return false;
  if (constraints.yearMin !== undefined && (film.year === null || film.year < constraints.yearMin)) return false;
  if (constraints.yearMax !== undefined && (film.year === null || film.year > constraints.yearMax)) return false;
  if (constraints.genre !== undefined && !film.genres.some((genre) => normalize(genre) === normalize(constraints.genre!))) return false;
  if (constraints.window && !film.screenings.some((screening) => {
    const timestamp = Date.parse(screening.datetime);
    return timestamp >= Date.parse(constraints.window!.from) && timestamp <= Date.parse(constraints.window!.to);
  })) return false;
  return true;
}

/** Calls the real palette implementation, restricting the comparison universe to the frozen cohort. */
export function baselinePalette(corpus: DiscoveryCorpus, query: DiscoveryQuery): DiscoveryRanking[] {
  const eligible = new Map(corpus.films.filter((film) => meetsConstraints(film, query.hardConstraints)).map((film) => [film.id, film]));
  const indexes = buildCatalogIndexes({
    films: corpus.catalog.films.filter((film) => eligible.has(film.id)), cinemas: [], people: [],
  });
  return searchCatalog(indexes, query.text).films.map((film, index) => ({ filmId: film.id, score: 1 / (index + 1) }));
}

const STOP_WORDS = new Set("a an the of in on at to and or for with about film films movie movies me i want see find something please showing show is are it this that from by where who under over minutes year years long between released before after".split(" "));

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(/[^\p{L}\p{N}]+/u).filter((token) => token && !STOP_WORDS.has(token)));
}

function filmMetadata(film: DiscoveryFilm) {
  return {
    id: film.id, title: film.title, originalTitle: film.originalTitle ?? null,
    tagline: film.tagline ?? null, year: film.year, runtime: film.runtime,
    directors: film.directors, genres: film.genres, synopsis: film.synopsis,
    countries: film.countries, languages: film.languages,
    screenings: film.screenings.map((screening) => ({ datetime: screening.datetime, cinema: screening.cinemaName })),
  };
}

export function baselineKeywords(corpus: DiscoveryCorpus, query: DiscoveryQuery): DiscoveryRanking[] {
  const queryTokens = tokens(query.text);
  return corpus.films.filter((film) => meetsConstraints(film, query.hardConstraints)).map((film) => {
    const metadata = filmMetadata(film);
    const haystack = tokens([
      metadata.title, metadata.originalTitle, metadata.tagline, metadata.year, metadata.runtime,
      ...metadata.directors, ...metadata.genres, metadata.synopsis, ...metadata.countries, ...metadata.languages,
      ...metadata.screenings.flatMap((screening) => [screening.datetime, screening.cinema]),
    ].filter((value) => value !== null).join(" "));
    const matches = [...queryTokens].filter((token) => haystack.has(token)).length;
    return { filmId: film.id, score: queryTokens.size ? matches / queryTokens.size : 0 };
  }).filter((item) => item.score > 0).sort(rankOrder);
}

function rankOrder(a: DiscoveryRanking, b: DiscoveryRanking): number {
  return b.score - a.score || a.filmId.localeCompare(b.filmId);
}

export function discoveryRequests(corpus: DiscoveryCorpus, query: DiscoveryQuery, variant: Variant, batchSize = 8): EvaluationRequest[] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("batchSize must be a positive integer");
  const requests: EvaluationRequest[] = [];
  // All films are scored, including lexical misses. Deterministic hard filters apply to all rankings later.
  for (let offset = 0; offset < corpus.films.length; offset += batchSize) {
    const films = corpus.films.slice(offset, offset + batchSize);
    requests.push({
      model: MODEL,
      state: { query: query.text, hardConstraints: query.hardConstraints ? { ...query.hardConstraints } : null, films: films.map(filmMetadata) },
      questions: Object.fromEntries(films.map((film) => [`film_${film.id}`, {
        type: "score" as const,
        instructions: variant === "v1"
          ? `How relevant is film ${film.id} to the user's request? Use only the supplied film metadata.`
          : `Evaluate film ${film.id} against the user's request using only the supplied metadata. Score each film independently. A shared word or genre is insufficient when the requested setting, subject, or relationship is absent. For an exact title or director request, require the named title or director. Missing evidence must not be filled from outside knowledge. Score zero if the main request is unsupported.`,
        criteria: [
          "0: No supported match to the main request.",
          "1: Weak or incidental match; central requested features are absent or unsupported.",
          "2: Good partial match with meaningful evidence for the main request.",
          "3: Direct, strong match supported by the supplied metadata.",
        ],
      }])) as EvaluationRequest["questions"],
    });
  }
  return requests;
}

export function rankDiscovery(corpus: DiscoveryCorpus, query: DiscoveryQuery, records: EvaluationRecord[], options: { minimumScore?: number } = {}): DiscoveryRanking[] {
  const minimumScore = options.minimumScore ?? 1.5;
  const scores = new Map<string, number>();
  const filmById = new Map(corpus.films.map((film) => [film.id, film]));
  for (const record of records) {
    const state = record.request.state;
    if (state === null || Array.isArray(state) || typeof state !== "object" || state.query !== query.text) continue;
    for (const [key, answer] of Object.entries(record.response.answers)) {
      if (!key.startsWith("film_") || answer.type !== "score") continue;
      const id = key.slice(5);
      const film = filmById.get(id);
      if (film && meetsConstraints(film, query.hardConstraints)) scores.set(id, answer.score);
    }
  }
  return [...scores].map(([filmId, score]) => ({ filmId, score })).filter((item) => item.score >= minimumScore).sort(rankOrder);
}

export interface DiscoveryMetrics {
  ndcg5: number | null;
  top3Relevance: number | null;
  top3RelevantCount: number;
  noMatchCorrect: boolean | null;
  hardConstraintViolations: number;
  unscoredResults: number;
  judgedRelevantFilms: number;
}

/** Uncertain judgments are excluded from metric denominators, never silently treated as irrelevant. */
export function discoveryMetrics(corpus: DiscoveryCorpus, query: DiscoveryQuery, ranking: DiscoveryRanking[]): DiscoveryMetrics {
  const filmById = new Map(corpus.films.map((film) => [film.id, film]));
  const eligibleLabels = corpus.films.filter((film) => meetsConstraints(film, query.hardConstraints))
    .map((film) => query.relevance[film.id]).filter((label): label is 0 | 1 | 2 | 3 => label !== null && label !== undefined);
  const judgedResults = ranking.filter((item) => query.relevance[item.filmId] !== null && query.relevance[item.filmId] !== undefined);
  const gain = (labels: number[]) => labels.reduce((total, label, index) => total + (2 ** label - 1) / Math.log2(index + 2), 0);
  const ideal = gain([...eligibleLabels].sort((a, b) => b - a).slice(0, 5));
  const top3 = ranking.slice(0, 3).map((item) => query.relevance[item.filmId])
    .filter((label): label is 0 | 1 | 2 | 3 => label !== null && label !== undefined);
  const judgedRelevantFilms = eligibleLabels.filter((label) => label >= 2).length;
  const allEligibleJudged = corpus.films.filter((film) => meetsConstraints(film, query.hardConstraints)).length === eligibleLabels.length;
  return {
    ndcg5: ideal > 0 ? gain(judgedResults.slice(0, 5).map((item) => query.relevance[item.filmId]!)) / ideal : null,
    top3Relevance: top3.length ? top3.reduce<number>((total, label) => total + label, 0) / top3.length : ranking.length === 0 ? 0 : null,
    top3RelevantCount: top3.filter((label) => label >= 2).length,
    noMatchCorrect: allEligibleJudged ? (judgedRelevantFilms === 0) === (ranking.length === 0) : null,
    hardConstraintViolations: ranking.filter((item) => {
      const film = filmById.get(item.filmId);
      return !film || !meetsConstraints(film, query.hardConstraints);
    }).length,
    unscoredResults: ranking.length - judgedResults.length,
    judgedRelevantFilms,
  };
}
