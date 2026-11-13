/**
 * Stored titles from the 13 Nov 2026 listings QA.
 * The repair script and the tests both use these strings.
 */

export const QUOTE_TITLE_REPAIRS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "My Bloody Valentine 'Loveless", to: "My Bloody Valentine 'Loveless'" },
  { from: "Primal Scream 'Screamadelica", to: "Primal Scream 'Screamadelica'" },
  { from: "Joni Mitchell 'Hejira", to: "Joni Mitchell 'Hejira'" },
];

/** `' (35th Anniversary)` → `(35th Anniversary)`. Any other note stays put. */
export function noteWithoutStrayQuote(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/^['\u2018\u2019]\s+(\(.*\))$/);
  return match ? match[1] : null;
}

/** Search-page source ids were built from the truncated title. */
export function restoredAlkerSourceId(sourceId: string | null): string | null {
  if (!sourceId?.endsWith("-alker")) return sourceId;
  return `${sourceId.slice(0, -"alker".length)}stalker`;
}
