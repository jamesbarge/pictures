/**
 * Canonical BFI sourceId builder — shared across all three ingest paths
 * (stealth Playwright, PDF importer, programme-changes parser).
 *
 * Why this exists: each path historically built its own sourceId
 * (`bfi-…` vs `bfi-pdf-…` vs `bfi-changes-…`, and Playwright preferred a
 * URL articleId). A path flip (e.g. Playwright → PDF fallback) therefore
 * produced a DIFFERENT sourceId for the same physical screening, so the
 * `(cinema_id, source_id)` upsert inserted a duplicate row instead of
 * updating in place. Keying every path on the same deterministic shape
 * makes the upsert idempotent across paths.
 *
 *   bfi-<cinemaId>-<titleSlug>-<screen>-<iso>
 *
 * The `<screen>` segment is normalised to a canonical token (NFT1..4 /
 * STUDIO / IMAX / REUBEN) so the SAME screen resolves identically whether
 * the source string is "Southbank - NFT3" (Playwright row[63/64]) or
 * "NFT3" (PDF venue). It also disambiguates the same film showing
 * simultaneously in two screens (NFT1 vs NFT2), which previously collapsed.
 */

/** Title → lowercase hyphenated slug. Matches the pre-existing Playwright
 *  slug exactly (lowercase + whitespace→dash) to minimise churn. */
export function bfiTitleSlug(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, "-");
}

/** Normalise a raw screen/venue string to a canonical token so the same
 *  physical screen keys identically across all ingest paths. */
export function normalizeBfiScreen(raw?: string | null): string {
  if (!raw) return "na";
  const s = raw
    .toUpperCase()
    .replace(/\bBFI\b/g, " ")
    .replace(/SOUTHBANK\s*-\s*/g, " ")
    .trim();
  const m = s.match(/NFT\s*[1-4]|STUDIO|IMAX|REUBEN/);
  if (m) return m[0].replace(/\s+/g, "");
  const fallback = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return fallback || "na";
}

/** Build the canonical, path-agnostic BFI sourceId. */
export function buildBfiSourceId(
  cinemaId: string,
  title: string,
  screen: string | null | undefined,
  datetime: Date,
): string {
  return `bfi-${cinemaId}-${bfiTitleSlug(title)}-${normalizeBfiScreen(screen)}-${datetime.toISOString()}`;
}
