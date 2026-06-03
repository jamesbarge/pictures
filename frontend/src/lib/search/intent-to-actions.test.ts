/**
 * Vitest spec for `intentToActions`.
 *
 * Pure function — easy to test exhaustively. We pin a fixed `now` so
 * date phrases produce deterministic chips.
 */

import { describe, expect, it } from "vitest";
import { parseQuery } from "./parse-query";
import { intentToActions } from "./intent-to-actions";

const NOW = new Date("2026-05-19T12:00:00Z");

describe("intentToActions", () => {
  it("returns empty array for an empty intent", () => {
    expect(intentToActions(parseQuery("", NOW))).toEqual([]);
  });

  it("returns empty array for pure freeText (no slices)", () => {
    expect(intentToActions(parseQuery("akira kurosawa", NOW))).toEqual([]);
  });

  it("returns a single composite action when one slice is present", () => {
    const r = intentToActions(parseQuery("70mm", NOW));
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("filter-action");
    expect(r[0].label).toMatch(/70MM/);
    expect(r[0].shortcut).toBe("⌥↵");
  });

  it("composes a label across multiple slices", () => {
    const r = intentToActions(parseQuery("horror 70mm tonight", NOW));
    expect(r).toHaveLength(1);
    expect(r[0].label).toMatch(/70MM/);
    expect(r[0].label).toMatch(/horror/);
    expect(r[0].label).toMatch(/TONIGHT/);
  });

  it("uses a stable id when the intent is unchanged", () => {
    const a = intentToActions(parseQuery("horror 70mm tonight", NOW));
    const b = intentToActions(parseQuery("horror 70mm tonight", NOW));
    expect(a[0].id).toBe(b[0].id);
  });

  it("changes the id when a slice changes", () => {
    const a = intentToActions(parseQuery("horror 70mm tonight", NOW));
    const b = intentToActions(parseQuery("horror 35mm tonight", NOW));
    expect(a[0].id).not.toBe(b[0].id);
  });

  it("includes decade when present", () => {
    const r = intentToActions(parseQuery("80s horror", NOW));
    expect(r).toHaveLength(1);
    expect(r[0].label).toMatch(/80s/);
    expect(r[0].label).toMatch(/horror/);
  });

  it("ignores cinema tokens (deferred to step 9)", () => {
    // "at curzon" produces chainTokens but no actionable slice yet —
    // step 8 ships without cinema-token resolution. Confirms this slice
    // doesn't accidentally surface an action that would no-op.
    const r = intentToActions(parseQuery("at curzon", NOW));
    expect(r).toEqual([]);
  });

  it("surfaces an action for `repertory`", () => {
    const r = intentToActions(parseQuery("repertory", NOW));
    expect(r).toHaveLength(1);
    expect(r[0].label).toMatch(/repertory/);
  });
});
