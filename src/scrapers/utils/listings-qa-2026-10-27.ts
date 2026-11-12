/**
 * Exact live strings from the 27 Oct 2026 listings QA.
 * The repair script and the regression tests both use these.
 */

export const GARDEN_FLAMENCO = {
  from: "La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai Cortés)",
  to: "The Flamenco Guitar of Yerai Cortés",
} as const;

/** Garden's same title shape, with the release year kept beside the title. */
export const GARDEN_SONG_OF_THE_HANDS = {
  from: "El canto de las manos (Song of the Hands)",
  withYear: "El canto de las manos (Song of the Hands) (2025)",
  to: "Song of the Hands",
} as const;

export const GENESIS_CROW = {
  from: "The Crow - Seasonal Affective Cinema",
  to: "The Crow",
  note: "Seasonal Affective Cinema",
} as const;

/** Dashes that are the film's own title. The Genesis strand peel must not touch them. */
export const TITLES_WITH_A_DASH = [
  "Raft - A London Story",
  "Rammstein - Live in Mexico City",
] as const;
