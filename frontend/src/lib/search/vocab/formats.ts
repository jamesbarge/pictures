/**
 * Format token dictionary for the cmd+k query parser.
 *
 * Each key is the lowercased input token (or multi-word phrase) the
 * user might type; the value is the canonical format value to store
 * in `filters.formats` so it slots directly into the existing filter
 * store and the screenings query.
 *
 * Source of truth for canonical values: `$lib/constants/filters.ts`
 * (FORMAT_OPTIONS). Keep these aligned.
 */

export const FORMAT_TOKENS: Record<string, string> = {
  // 35mm
  "35mm": "35mm",
  "35 mm": "35mm",

  // 70mm and 70mm IMAX
  "70mm": "70mm",
  "70 mm": "70mm",
  "70mm imax": "70mm_imax",
  "70mm-imax": "70mm_imax",

  // IMAX
  "imax": "imax",
  "imax laser": "imax_laser",
  "imax-laser": "imax_laser",

  // Dolby
  "dolby": "dolby_cinema",
  "dolby cinema": "dolby_cinema",
  "dolby vision": "dolby_cinema",
  "atmos": "dolby_cinema",
  "dolby atmos": "dolby_cinema",

  // 4DX
  "4dx": "4dx",
  "4 dx": "4dx",

  // Digital and 3D — not in FORMAT_OPTIONS yet but commonly typed
  // We intentionally do NOT add these to filters.formats since the
  // existing UI doesn't surface them; they end up in freeText so
  // the server can still match via screenings.format tsvector.
};

export const FORMAT_PHRASES_BY_LENGTH: Record<number, string[]> = {
  2: ["70mm imax", "70 mm", "70mm-imax", "imax laser", "imax-laser", "35 mm", "dolby cinema", "dolby vision", "dolby atmos", "4 dx"],
};
