/**
 * Convert a parsed query intent into one or more filter actions the
 * palette can render as `[FILTER]` rows.
 *
 * Step 8 of the cmd+k plan ships a single composite action: "Apply: …"
 * — the user types a sentence like `horror 70mm at curzon this weekend`,
 * sees one filter row that applies every parseable slice at once, and
 * presses Enter (or Alt+Enter, or clicks). The 5-second magic.
 *
 * Each slice (cinemas, formats, genres, decades, dates, times, etc.)
 * is summarised in the action's label so the user knows what will
 * change before they commit. We deliberately do NOT spawn one row per
 * slice: the "atomic" composite action matches user mental model far
 * better — typing more keywords narrows the same row, not multiplies
 * the choices.
 *
 * The function is pure (depends only on `parsed`); the actual filter
 * mutation lives in `filters.applyIntent(parsed)`.
 */

import type { ParsedIntent } from "./parse-query";
import type { FilterActionResult } from "./result-types";

/**
 * Slices the palette currently knows how to translate into filter state.
 * Kept in sync with `filters.applyIntent()` — adding a new slice here
 * without wiring it in `applyIntent` would surface an action row that
 * silently no-ops.
 */
function hasActionableSlice(parsed: ParsedIntent): boolean {
  return (
    parsed.formats.length > 0 ||
    parsed.genres.length > 0 ||
    parsed.decades.length > 0 ||
    !!(parsed.dateFrom || parsed.dateTo) ||
    parsed.timeFrom !== undefined ||
    parsed.timeTo !== undefined ||
    parsed.isRepertory !== undefined
  );
}

function describeIntent(parsed: ParsedIntent): string {
  const parts: string[] = [];
  if (parsed.formats.length > 0) {
    parts.push(parsed.formats.map((f) => f.toUpperCase()).join("+"));
  }
  if (parsed.genres.length > 0) {
    parts.push(parsed.genres.join(", "));
  }
  if (parsed.decades.length > 0) {
    parts.push(parsed.decades.join(", "));
  }
  if (parsed.isRepertory === true) {
    parts.push("repertory");
  }
  // Date / time chips already encode their label; pluck the first one
  // that comes from the parser to keep the action label readable.
  const dateChip = parsed.chipDescriptors.find((c) => c.kind === "date");
  if (dateChip) parts.push(dateChip.label);
  const timeChip = parsed.chipDescriptors.find((c) => c.kind === "time");
  if (timeChip) parts.push(timeChip.label);
  return parts.join(" · ");
}

export function intentToActions(parsed: ParsedIntent): FilterActionResult[] {
  if (!hasActionableSlice(parsed)) return [];
  const description = describeIntent(parsed) || "matching filters";
  return [
    {
      kind: "filter-action",
      // The only action row. ResultsList keys rows by position, so the id is fixed.
      id: "apply",
      label: `Apply filters: ${description}`,
      shortcut: "⌥↵",
    },
  ];
}
