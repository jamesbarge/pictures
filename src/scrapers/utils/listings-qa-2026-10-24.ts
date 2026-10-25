/**
 * Exact stored titles from the 24 Oct 2026 listings QA.
 * The repair script and the cleaner tests both use these strings.
 */

export interface ListingTitleRepair {
  from: string;
  to: string;
  note: string;
}

export const LISTING_TITLE_REPAIRS: readonly ListingTitleRepair[] = [
  {
    from: "BFI IMAX exclusive preview: Godzilla Minus Zero",
    to: "Godzilla Minus Zero",
    note: "BFI IMAX exclusive preview",
  },
  {
    from: "Special preview: La Bola Negra",
    to: "La Bola Negra",
    note: "Special preview",
  },
  {
    from: "Women and the World Festival: Traces",
    to: "Traces",
    note: "Women and the World Festival",
  },
];

/** Drop a director entry that is the listing title copied into the credit. */
export function directorsWithoutCopiedTitle(directors: readonly string[], title: string): string[] {
  return directors.filter((director) => director.trim() !== title.trim());
}
