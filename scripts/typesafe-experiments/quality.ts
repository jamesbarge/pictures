import { createHash } from "node:crypto";
import { extractFilmTitleSync } from "../../src/lib/title-extraction/pattern-extractor";
import { decodeHtmlEntities } from "../../src/lib/title-patterns";
import {
  BILINGUAL_TITLE_PAIRS,
  CINEMA_CURATORIAL_PREFIXES,
  TITLE_SUFFIXES_TO_STRIP,
} from "../../src/lib/tmdb/__tests__/enrichment-fixtures";
import { MODEL, type EvaluationRecord, type EvaluationRequest, type Split, type Variant } from "./types";

export const QUALITY_FLAGS = ["isCompilation", "isLiveBroadcast", "isNonFilm"] as const;
type Flag = (typeof QUALITY_FLAGS)[number];

export interface QualityCase {
  id: string;
  family: string;
  split: Split;
  provenance: "behavioral-fixture" | "production-fixture" | "synthetic";
  source: string;
  expected: { extractedTitle: string | null } & Record<Flag, boolean | null>;
  titleScorable: boolean;
  note?: string;
}

export interface QualityPrediction {
  id: string;
  extractedTitle: string | null;
  isCompilation: boolean;
  isLiveBroadcast: boolean;
  isNonFilm: boolean;
  confidence: number;
}

export interface TitleCandidate { id: string; title: string }

const normalize = (value: string) => decodeHtmlEntities(value).replace(/\s+/g, " ").trim();

function familyForPrefix(prefix: string): string {
  const p = prefix.toLowerCase();
  if (/\bmet opera|national theatre/.test(p)) return "stage-broadcast";
  if (/shorts/.test(p)) return "shorts-programme";
  if (/presents?/.test(p)) return "presenter-wrapper";
  if (/parent|baby/.test(p)) return "parent-baby-wrapper";
  if (/senior/.test(p)) return "senior-wrapper";
  if (/member/.test(p)) return "member-wrapper";
  if (/relaxed/.test(p)) return "relaxed-wrapper";
  if (/kids|family|funday|ffc/.test(p)) return "family-wrapper";
  if (/queer|rio forever/.test(p)) return "queer-curation";
  if (/festival|lsff/.test(p)) return "festival-wrapper";
  if (/matinee/.test(p)) return "matinee-wrapper";
  if (/\b35mm|\b70mm/.test(p)) return "format-wrapper";
  if (/doc/.test(p)) return "documentary-wrapper";
  if (/new writings|library|conversation|playback/.test(p)) return "ambiguous-event-wrapper";
  return "other-curation";
}

function familyForSuffix(suffix: string): string {
  if (/birthday|anniversary/i.test(suffix)) return "anniversary-suffix";
  if (/restor|remast|35mm|vhs|b&w/i.test(suffix)) return "format-suffix";
  if (/cut/i.test(suffix)) return "edition-suffix";
  if (/premiere/i.test(suffix)) return "premiere-suffix";
  if (/dog friendly/i.test(suffix)) return "accessibility-suffix";
  if (/live organ|live score/i.test(suffix)) return "accompaniment-suffix";
  return "discussion-suffix";
}

/** Balance one-third of families and cases without inspecting any expected labels. */
function assignQualitySplits(cases: QualityCase[]) {
  const sizes = new Map<string, number>();
  for (const item of cases) sizes.set(item.family, (sizes.get(item.family) ?? 0) + 1);
  const seedOrder = (family: string) => createHash("sha256").update(`pictures-quality-v1:${family}`).digest("hex");
  const families = [...sizes.keys()].sort((a, b) => seedOrder(a).localeCompare(seedOrder(b)));
  const targetFamilies = Math.round(families.length / 3);
  const targetCases = Math.round(cases.length / 3);
  const combinations = new Map<string, string[]>([["0:0", []]]);
  for (const family of families) {
    for (const [key, selected] of [...combinations.entries()]) {
      const [count, total] = key.split(":").map(Number);
      if (count >= targetFamilies) continue;
      const nextKey = `${count + 1}:${total + sizes.get(family)!}`;
      if (!combinations.has(nextKey)) combinations.set(nextKey, [...selected, family]);
    }
  }
  const options = [...combinations.entries()].filter(([, selected]) => selected.length === targetFamilies)
    .sort(([a], [b]) => Math.abs(Number(a.split(":")[1]) - targetCases) - Math.abs(Number(b.split(":")[1]) - targetCases));
  const heldOut = new Set(options[0]?.[1] ?? []);
  for (const item of cases) item.split = heldOut.has(item.family) ? "holdout" : "development";
}

/** Freeze these labels before inference; the generated 100 combinations are not production listings. */
export function buildQualityCases(): QualityCase[] {
  const cases: QualityCase[] = [];
  const add = (
    id: string, source: string, extractedTitle: string | null, family: string,
    provenance: QualityCase["provenance"], flags: Partial<Record<Flag, boolean | null>> = {},
    note?: string, titleScorable = true,
  ) => cases.push({
    id, source, family, split: "development", provenance, titleScorable,
    expected: { extractedTitle, isCompilation: false, isLiveBroadcast: false, isNonFilm: false, ...flags },
    ...(note ? { note } : {}),
  });

  const behavioral: [string, string, string][] = [
    ["Saturday Morning Picture Club: Song of the Sea", "Song of the Sea", "family-wrapper"],
    ["Classic Matinee: Sunset Boulevard", "Sunset Boulevard", "matinee-wrapper"],
    ["35mm: The Godfather", "The Godfather", "format-wrapper"],
    ["When Harry Met Sally + Intro", "When Harry Met Sally", "discussion-suffix"],
    ["Inland Empire (4K Restoration)", "Inland Empire", "format-suffix"],
    ["Charlie's Angels - 25th Anniversary", "Charlie's Angels", "anniversary-suffix"],
    ["Queer Horror Nights: THE ROCKY HORROR PICTURE SHOW with Shadow Cast", "THE ROCKY HORROR PICTURE SHOW", "queer-curation"],
    ['Funeral Parade presents "A Star Is Born (1954)"', "A Star Is Born (1954)", "presenter-wrapper"],
    ["Sing-A-Long-A The Greatest Showman", "The Greatest Showman", "singalong-wrapper"],
    ["Aguirre, Wrath of God", "Aguirre, Wrath of God", "clean-title"],
    ["Classic Matinee: Lock, Stock &amp; Two Smoking Barrels", "Lock, Stock & Two Smoking Barrels", "matinee-wrapper"],
    ["Classic Matinee: Singin&#39; in the Rain", "Singin' in the Rain", "matinee-wrapper"],
  ];
  behavioral.forEach(([source, title, family], i) => add(`behavior-${i}`, source, title, family, "behavioral-fixture"));
  for (const [i, source] of ["The Gruffalo + The Gruffalo's Child", "The Gruffalo + The Gruffalo's Child Double-Bill"].entries()) {
    add(`double-${i}`, source, null, "double-bill", "behavioral-fixture", { isCompilation: true },
      "Policy difference, excluded from title accuracy: experiment requests no single-film match; existing contract selects the first film or preserves the double-bill title.", false);
  }
  add("live-opera", "Met Opera Live: Eugene Onegin (2026)", "Eugene Onegin", "stage-broadcast", "behavioral-fixture", { isLiveBroadcast: true });
  add("live-theatre", "National Theatre Live: Hamlet (2026)", "Hamlet", "stage-broadcast", "behavioral-fixture", { isLiveBroadcast: true });
  add("festival-ambiguous", "LSFF: Midnight Movies", null, "festival-wrapper", "behavioral-fixture", { isCompilation: null },
    "Existing test treats any festival prefix as compilation; title alone does not establish that. Title and compilation are unscored.", false);
  for (const [i, source] of ["Film Quiz Night", "Cinema Reading Group", "Comedy: Stand-Up Special"].entries()) {
    add(`event-${i}`, source, null, "nonfilm-event", "behavioral-fixture", { isNonFilm: true });
  }

  // Exact source titles from the production regression fixture, with manually reviewed labels.
  const production: [string, string | null, string][] = [
    ["Relaxed Screening: My Father's Shadow", "My Father's Shadow", "relaxed-wrapper"],
    ["The Old Ways: A Century in Sound", "A Century in Sound", "other-curation"],
    ["Throwback: Top Gun (40th Anniversary)", "Top Gun", "anniversary-suffix"],
    ["Throwback: Legally Blonde (25th Anniversary)", "Legally Blonde", "anniversary-suffix"],
    ["Barry Lyndon (50th Anniversary)", "Barry Lyndon", "anniversary-suffix"],
    ["Classic Matinee: THE FULL MONTY", "THE FULL MONTY", "matinee-wrapper"],
    ["David Attenborough: A Life on Our Planet", "David Attenborough: A Life on Our Planet", "meaningful-colon"],
    ["New Writings: In the Scene: Agnes Varda", null, "ambiguous-event-wrapper"],
    ["Member Library Lates: Guillermo del Toro", null, "member-wrapper"],
    ["Niki de Saint Phalle: 4k Restoration Daddy", "Daddy", "other-curation"],
    ["Daisies (Sedmikrásky)", "Daisies (Sedmikrásky)", "bilingual-title"],
  ];
  production.forEach(([source, title, family], i) => add(`production-${i}`, source, title, family, "production-fixture", { isNonFilm: title === null }));

  const baseTitles = ["Casablanca", "2001: A Space Odyssey", "The Godfather Part II", "Daisies (Sedmikrásky)"];
  CINEMA_CURATORIAL_PREFIXES.forEach((prefix, i) => {
    const family = familyForPrefix(prefix);
    const broadcast = family === "stage-broadcast";
    const ambiguous = /workshop|shorts|new writings|library|conversation|playback|tv preview|exhibition on screen|mixtape/i.test(prefix);
    const title = broadcast ? "Eugene Onegin" : baseTitles[i % baseTitles.length];
    add(`prefix-${i}`, `${prefix} ${title}`, title, family, "synthetic",
      ambiguous ? { isCompilation: null, isLiveBroadcast: null, isNonFilm: null } : { isLiveBroadcast: broadcast },
      ambiguous
        ? "Constructed wrapper combination. The fixture proves a historical prefix, not the nature of this hypothetical event; all outcomes unscored."
        : "Constructed combination using a production-observed wrapper; not a production listing.", !ambiguous);
  });
  TITLE_SUFFIXES_TO_STRIP.forEach((suffix, i) => {
    const title = baseTitles[i % baseTitles.length];
    add(`suffix-${i}`, `${title} ${suffix}`, title, familyForSuffix(suffix), "synthetic", {},
      "Constructed combination using a production-observed suffix; not a production listing.");
  });
  const protectedTitles: [string, string][] = [
    ["2001: A Space Odyssey", "meaningful-colon"], ["Mission: Impossible", "meaningful-colon"],
    ["Spider-Man: Across the Spider-Verse", "meaningful-colon"], ["Star Wars: The Last Jedi", "meaningful-colon"],
    ["The Godfather Part II", "sequel-title"], ["Toy Story 3", "sequel-title"],
    ["28 Days Later", "sequel-title"], ["Quiz Show", "nonfilm-keyword-collision"],
    ["Official Competition", "nonfilm-keyword-collision"], ["The King of Comedy", "nonfilm-keyword-collision"],
    ["Marathon Man", "nonfilm-keyword-collision"], ["Dune: Part Two", "meaningful-colon"],
  ];
  protectedTitles.forEach(([title, family], i) => add(`protected-${i}`, title, title, family, "synthetic"));
  BILINGUAL_TITLE_PAIRS.forEach(({ english, original }, i) => {
    if (english !== "Daisies") add(`bilingual-${i}`, `${english} (${original})`, `${english} (${original})`, "bilingual-title", "synthetic");
  });
  add("shorts-explicit", "London Short Film Festival: Animated Shorts Programme", null, "shorts-programme", "synthetic", { isCompilation: true });
  add("feature-at-festival", "BFI Flare: Moonlight", "Moonlight", "festival-wrapper", "synthetic", {},
    "A festival banner alone does not make a feature film a compilation.");
  assignQualitySplits(cases);
  return cases;
}

/** Candidates depend only on the supplied title, never labels or fixture prefix lists. */
export function qualityCandidates(raw: string): TitleCandidate[] {
  const source = normalize(raw);
  const candidates = new Set<string>([source]);
  const cleanSpan = (text: string) => text.trim().replace(/^["“”]+|["“”]+$/g, "").trim();
  const add = (text: string) => {
    const value = cleanSpan(text);
    if (value.length >= 2 && source.includes(value)) candidates.add(value);
  };
  add(normalize(extractFilmTitleSync(raw).extractedTitle));
  const starts = new Set<number>([0]);
  const ends = new Set<number>([source.length]);
  // Enumerate source spans at generic event punctuation and phrase boundaries.
  const boundary = /:\s*|\s+[+–—-]\s+|\s*\([^)]*\)|\s+(?:presents?\b[.:]*|in conversation\b|with shadow cast\b)\s*|^Sing-?A-?Long-?A?\s+|\s+Double[- ]?Bill\b/gi;
  for (const match of source.matchAll(boundary)) {
    ends.add(match.index);
    starts.add(match.index + match[0].length);
  }
  for (const start of starts) for (const end of ends) if (end > start) add(source.slice(start, end));
  return [...candidates].map((title, i) => ({ id: `t${i}`, title }));
}

export function qualityRequest(item: QualityCase, variant: Variant, reverse = false): EvaluationRequest {
  const candidates = qualityCandidates(item.source);
  if (reverse) candidates.reverse();
  const detail = variant === "v2"
    ? " Preserve meaningful subtitles, sequel numbers and bilingual titles. Remove event branding, formats and discussion appendages. A film with live musical accompaniment is not a stage broadcast; a festival label alone does not imply a compilation. Never identify one film from a double bill. A title containing Quiz or Competition can still be a film."
    : "";
  return {
    model: MODEL,
    state: { listingTitle: normalize(item.source), candidates: candidates.map(({ id, title }) => ({ id, title })) },
    questions: {
      pick: {
        type: "choice",
        instructions: "Select the complete underlying single film or stage-work title from the candidates. Retain a parenthesized alternate-language title or historical release year. Remove a current screening-year annotation on a stage broadcast. Choose none if no candidate fits, the listing is an event without a film, or it represents multiple films." + detail,
        criteria: {
          ...Object.fromEntries(candidates.map(({ id, title }) => [id, { title }])),
          none: "No single underlying work is safely identifiable among the candidates.",
        },
      },
      isCompilation: {
        type: "noul", instructions: "Does this listing represent multiple films, a double bill, or a shorts programme? A festival-branded single feature is false." + detail,
      },
      isLiveBroadcast: {
        type: "noul", instructions: "Is this a cinema transmission or encore recording of a stage performance such as opera, ballet or theatre? An ordinary film with a live introduction or score is false." + detail,
      },
      isNonFilm: {
        type: "noul", instructions: "Is this a non-film event such as a quiz, discussion without a film, workshop, reading or concert? A film followed by discussion is false. Stage broadcasts and film compilations have their own flags and are false here." + detail,
      },
    },
  };
}

export function qualityBaseline(item: QualityCase): QualityPrediction {
  const result = extractFilmTitleSync(item.source);
  return { id: item.id, extractedTitle: result.isNonFilm || result.isCompilation ? null : normalize(result.extractedTitle), isCompilation: result.isCompilation,
    isLiveBroadcast: result.isLiveBroadcast, isNonFilm: result.isNonFilm, confidence: result.confidence };
}

export function qualityPrediction(item: QualityCase, record: EvaluationRecord): QualityPrediction {
  const pick = record.response.answers.pick;
  if (!pick || pick.type !== "choice") throw new Error(`Missing choice answer for ${item.id}`);
  const candidate = qualityCandidates(item.source).find(({ id }) => id === pick.choice);
  if (pick.choice !== "none" && !candidate) throw new Error(`Unknown title candidate for ${item.id}`);
  const flags = Object.fromEntries(QUALITY_FLAGS.map((flag) => {
    const answer = record.response.answers[flag];
    if (!answer || answer.type !== "noul") throw new Error(`Missing ${flag} answer for ${item.id}`);
    return [flag, answer.noul >= 0.5];
  })) as Record<Flag, boolean>;
  return { id: item.id, extractedTitle: candidate?.title ?? null, ...flags, confidence: pick.confidence };
}

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;

export function qualityMetrics(cases: QualityCase[], predictions: QualityPrediction[]) {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  const answered = cases.filter((item) => byId.has(item.id));
  const scored = answered.filter((item) => item.titleScorable);
  const matches = (item: QualityCase) => byId.get(item.id)!.extractedTitle === item.expected.extractedTitle;
  const titleCorrect = scored.filter(matches).length;
  const candidateMisses = cases.filter((item) => item.titleScorable && item.expected.extractedTitle !== null
    && !qualityCandidates(item.source).some(({ title }) => title === item.expected.extractedTitle));
  const candidateScored = cases.filter((item) => item.titleScorable && item.expected.extractedTitle !== null);
  const protectedCases = scored.filter((item) => item.expected.extractedTitle === normalize(item.source));
  const harmfulStripping = protectedCases.filter((item) => {
    const value = byId.get(item.id)!.extractedTitle;
    return value !== null && value !== item.expected.extractedTitle && normalize(item.source).includes(value);
  }).length;
  const classification = Object.fromEntries(QUALITY_FLAGS.map((flag) => {
    const rows = answered.filter((item) => item.expected[flag] !== null);
    const tp = rows.filter((item) => item.expected[flag] && byId.get(item.id)![flag]).length;
    const fp = rows.filter((item) => !item.expected[flag] && byId.get(item.id)![flag]).length;
    const fn = rows.filter((item) => item.expected[flag] && !byId.get(item.id)![flag]).length;
    return [flag, { scored: rows.length, tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) }];
  })) as Record<Flag, { scored: number; tp: number; fp: number; fn: number; precision: number | null; recall: number | null }>;
  const missIds = new Set(candidateMisses.map(({ id }) => id));
  return {
    total: cases.length, answered: answered.length, missing: cases.length - answered.length,
    titleScored: scored.length, titleCorrect, titleAccuracy: ratio(titleCorrect, scored.length),
    protectedTitles: protectedCases.length, harmfulStripping, harmfulStrippingRate: ratio(harmfulStripping, protectedCases.length),
    candidateScored: candidateScored.length, candidateMisses: candidateMisses.map(({ id }) => id),
    candidateCoverage: ratio(candidateScored.length - candidateMisses.length, candidateScored.length),
    classification,
    errors: scored.filter((item) => !matches(item)).map((item) => ({
      id: item.id, source: item.source, expected: item.expected.extractedTitle,
      actual: byId.get(item.id)!.extractedTitle, confidence: byId.get(item.id)!.confidence,
      cause: missIds.has(item.id) ? "candidate-missing" : "selection-error", provenance: item.provenance,
    })),
  };
}

export function qualityConfidenceCoverage(cases: QualityCase[], predictions: QualityPrediction[], thresholds = [0, 0.7, 0.8, 0.9, 0.95]) {
  return thresholds.map((threshold) => {
    const selected = predictions.filter(({ confidence }) => confidence >= threshold);
    const metrics = qualityMetrics(cases, selected);
    return { threshold, answered: metrics.answered, coverage: ratio(metrics.answered, cases.length),
      titleScored: metrics.titleScored, titleAccuracy: metrics.titleAccuracy, harmfulStripping: metrics.harmfulStripping };
  });
}
