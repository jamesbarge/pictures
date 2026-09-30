/**
 * Dedup judgement — TypeSafe question definitions.
 *
 * Pure module: builds the request body for one candidate film pair. No I/O,
 * no DB, no network, so the level descriptions can be unit-tested and diffed
 * like any other rule table.
 *
 * Why this exists
 * ---------------
 * `src/lib/film-similarity.ts` decides duplicates with two numbers:
 * `trigramThresholdFor()` (0.78 / 0.70 / 0.60 by word count) and
 * `violatesYearWindow()` (MAX_YEAR_DELTA = 5). Neither can separate the two
 * populations that both present as "same title, big year gap":
 *
 *   Blue Velvet [1986, tmdb 793]   vs  Blue Velvet [2011, tmdb 680713]  -> same film,
 *                                                                          wrong TMDB id
 *   Halloween  [1978, tmdb 948]    vs  Halloween  [2007, tmdb 2082]     -> Carpenter vs
 *                                                                          Rob Zombie
 *
 * 26 identical-title pairs in the live DB sit in that band and the year window
 * rejects all of them. A further 23 have a year on one side only, which the
 * window cannot judge at all (the `Practical Magic` case in RECENT_CHANGES.md).
 *
 * The four domain rules encoded in the Score levels below were set by James on
 * 2026-09-22:
 *   - a 4K restoration is the same film as the original
 *   - a dubbed print is the same film as the subtitled one
 *   - a director's cut merges into the original
 *   - a double bill is its own entity
 */

import { MODEL, type EvaluationRequest } from "../typesafe-experiments/types";

/** One side of a candidate pair, as sent to the model. */
export interface FilmSide {
  title: string;
  year: number | null;
  tmdbId: number | null;
  directors: string[];
  runtime: number | null;
  synopsis: string | null;
  /** Cinemas this film currently has screenings at, for repertory context. */
  venues: string[];
  screeningCount: number;
}

/** A candidate pair plus the cheap signal that shortlisted it. */
export interface CandidatePair {
  leftId: string;
  rightId: string;
  left: FilmSide;
  right: FilmSide;
  /** pg_trgm similarity of the two titles, 0..1. */
  trigramSimilarity: number;
}

/** Ordered Score levels. Index is the level; order carries meaning. */
export const RELATIONSHIP_LEVELS = [
  {
    level: "different films",
    meaning:
      "Two distinct works that happen to share a title, or nearly share one.",
    includes: [
      "A remake and its original (Halloween 1978 by John Carpenter and Halloween 2007 by Rob Zombie are different films).",
      "Separate adaptations of the same play, novel or true story by different production teams.",
      "Different instalments of a series (Alien and Aliens; Blade Runner and Blade Runner 2049).",
      "A documentary about a film, and the film itself.",
      "Two unrelated films that simply share a common title (Heat 1972 by Paul Morrissey and Heat 1995 by Michael Mann).",
    ],
  },
  {
    level: "related, a person should decide",
    meaning:
      "Plausibly one work, with something unresolved that makes an automatic merge unsafe.",
    includes: [
      "One side carries no year, no director and no synopsis, so there is nothing to confirm the match against beyond the title.",
      "The title is generic or very short and could easily belong to two works.",
      "The two look like the same work but one side's metadata contradicts it in a way that is not explained by a re-release.",
      "Either side looks like a season wrapper, festival placeholder, quiz, talk or sports fixture rather than a film.",
    ],
  },
  {
    level: "same film",
    meaning:
      "One underlying work. Merging these two records loses nothing.",
    includes: [
      "The same film recorded twice with different capitalisation, punctuation, a stray leading dash, or a season name moved from prefix to suffix.",
      "A restoration or re-release and the original. '4K Restoration', 'Remastered' and a re-release year on one side still mean the same film.",
      "A dubbed print and a subtitled print of the same film.",
      "A director's cut, final cut or extended edition and the original release.",
      "One side dated by the year of the print or re-release rather than the year of the film, which is a common wrong-TMDB-match artefact.",
      "The same film under its original-language title and its English title.",
    ],
  },
] as const;

/** Build the ordered `criteria` array the Score question expects. */
function scoreCriteria() {
  return RELATIONSHIP_LEVELS.map((l) => ({
    level: l.level,
    meaning: l.meaning,
    includes: [...l.includes],
  }));
}

/**
 * Trim a synopsis so a 400-pair run stays well inside the 32k state budget.
 * The first couple of sentences carry the premise, which is all the judgement
 * needs; the rest is cast and marketing copy.
 */
export function trimSynopsis(synopsis: string | null, maxChars = 320): string | null {
  if (!synopsis) return null;
  const clean = synopsis.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).replace(/\s+\S*$/, "")}…`;
}

function sideState(side: FilmSide) {
  return {
    title: side.title,
    year: side.year,
    tmdb_id: side.tmdbId,
    directors: side.directors.length ? side.directors : null,
    runtime_minutes: side.runtime,
    synopsis: trimSynopsis(side.synopsis),
    screens_at: side.venues.length ? side.venues : null,
    screening_count: side.screeningCount,
  };
}

/**
 * Build the request for one pair. The model is pinned (not `jev-latest`) so a
 * cached run stays comparable with the next one; bump MODEL deliberately.
 */
export function buildRequest(pair: CandidatePair, model = MODEL): EvaluationRequest {
  return {
    state: {
      left: sideState(pair.left),
      right: sideState(pair.right),
    },
    model,
    questions: {
      relationship: {
        type: "score",
        instructions: {
          question:
            "How do the two film records `left` and `right` relate to each other?",
          context:
            "Both records come from a London cinema listings database that covers repertory and independent venues. Old films are screened constantly, often as restorations or re-releases, so a recent year on a record is weak evidence that the film itself is recent. Records are created by matching a scraped listing title against TMDB, and a wrong TMDB match is the single most common cause of a film appearing twice.",
          cost_of_error:
            "Merging two records that are different films is expensive: every screening, season link and saved status of both records ends up on one film and untangling it later means working out which fact came from where. Failing to merge two records that are the same film only leaves a duplicate in the listings, which is cheap to fix later.",
        },
        criteria: scoreCriteria(),
      },

      same_underlying_work: {
        type: "noul",
        instructions:
          "Are `left` and `right` the same underlying work, ignoring any difference of cut, print, restoration, dub or subtitling?",
        criteria: {
          true: "One work. A restoration, a director's cut, a dubbed print or a re-release of a film is still that film.",
          false: "Two works, including a remake and its original, or two separate adaptations of the same source.",
        },
      },

      is_remake_pair: {
        type: "noul",
        instructions:
          "Is one of `left` and `right` a remake or a separate later adaptation of the other?",
        criteria: {
          true: "A distinct later production telling the same story with a different director or cast.",
          false: "Anything else, including a restoration or re-release of the same production.",
        },
      },

      either_is_double_bill: {
        type: "noul",
        instructions:
          "Does the title of `left` or of `right` advertise two or more distinct films shown together?",
        criteria: {
          true: "A double bill, double feature, marathon, or a title joining two separate films with '+' or '&'.",
          false: "Each title names a single film, or names no film at all.",
        },
      },

      either_is_not_a_film: {
        type: "noul",
        instructions:
          "Is `left` or `right` something other than a film, judged from its title and synopsis?",
        criteria: {
          true: "A season or festival wrapper with no film named, a quiz, a talk, a club night, a sports fixture, a private hire, or a placeholder such as a gala closing film that was never named.",
          false: "Both records name an actual film, including live broadcasts of theatre, opera or ballet.",
        },
      },

      disagree_on_instalment: {
        type: "noul",
        instructions:
          "Do the titles of `left` and `right` disagree about which numbered instalment of a series they are?",
        criteria: {
          true: "One names a sequel number or numbered part that the other does not, or they name different ones.",
          false: "Both name the same instalment, or neither is part of a numbered series.",
        },
      },
    },
  };
}
