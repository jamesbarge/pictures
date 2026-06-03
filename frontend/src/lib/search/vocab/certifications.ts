/**
 * BBFC certification tokens.
 *
 * Maps user-typed certifications to canonical strings stored in
 * films.certification. Note "12" and "12A" are distinct.
 */

export const CERTIFICATION_TOKENS: Record<string, string> = {
  u: "U",
  pg: "PG",
  "12": "12",
  "12a": "12A",
  "15": "15",
  "18": "18",
  r18: "R18",
};
