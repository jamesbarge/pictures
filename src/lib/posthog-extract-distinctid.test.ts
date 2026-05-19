/**
 * Tests for `extractDistinctIdFromCookies` from src/lib/posthog-server.ts.
 *
 * Separate file from posthog-server.test.ts (doesn't exist yet) to avoid
 * pulling in the posthog-node client init. This function is pure-string-parsing.
 */
import { describe, expect, it } from "vitest";
import { extractDistinctIdFromCookies } from "./posthog-server";

const POSTHOG_DATA = (id: string): string =>
  encodeURIComponent(JSON.stringify({ distinct_id: id, $sesid: [1, 2] }));

describe("extractDistinctIdFromCookies", () => {
  it("returns undefined for null cookie string", () => {
    expect(extractDistinctIdFromCookies(null)).toBeUndefined();
  });

  it("returns undefined for empty cookie string", () => {
    expect(extractDistinctIdFromCookies("")).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // KNOWN BUG: regex `ph_[^_]+_posthog` does NOT match real PostHog cookies.
  //
  // Real PostHog cookies look like `ph_phc_<projectid>_posthog` — i.e. the
  // project key contains underscores (`phc_xxxxxxxxxxxxx`). The current regex
  // requires `[^_]+` (NO underscore) between `ph_` and `_posthog`, so it
  // matches `ph_FOO_posthog` only.
  //
  // The tests below PIN this broken behaviour so a maintainer can see the
  // gap deliberately. The fix is straightforward (change `[^_]+` → `.+?` or
  // `[^=]+`), but it changes runtime behaviour and should ship as its own PR
  // with a verified production cookie sample.
  // -------------------------------------------------------------------------

  it("(BUG) does NOT match real PostHog cookies of the form `ph_phc_<projectid>_posthog`", () => {
    const cookie = `ph_phc_abc123_posthog=${POSTHOG_DATA("user-uuid-1")}`;
    // Regex requires the segment between `ph_` and `_posthog` to be
    // underscore-free. Real PostHog cookies have an underscore (project key
    // includes the `phc_` prefix).
    expect(extractDistinctIdFromCookies(cookie)).toBeUndefined();
  });

  it("extracts distinct_id from a PostHog cookie WITHOUT underscores in the project key", () => {
    // The narrower case the regex DOES handle: `ph_KEY_posthog` with no
    // internal underscore in KEY. Documenting the slice of valid input.
    const cookie = `ph_FOOKEY_posthog=${POSTHOG_DATA("user-uuid-1")}`;
    expect(extractDistinctIdFromCookies(cookie)).toBe("user-uuid-1");
  });

  it("returns undefined when cookie string has no PostHog cookie", () => {
    expect(extractDistinctIdFromCookies("session=abc; theme=dark")).toBeUndefined();
  });

  it("returns undefined when PostHog cookie value is malformed (parse error swallowed)", () => {
    const cookie = "ph_FOO_posthog=not-valid-json";
    expect(extractDistinctIdFromCookies(cookie)).toBeUndefined();
  });

  it("returns undefined when PostHog cookie JSON has no distinct_id field", () => {
    const cookie = `ph_FOO_posthog=${encodeURIComponent(JSON.stringify({ other: "data" }))}`;
    expect(extractDistinctIdFromCookies(cookie)).toBeUndefined();
  });

  it("finds an underscore-free-key PostHog cookie even when not first in the string", () => {
    const cookie = `session=abc; ph_BAR_posthog=${POSTHOG_DATA("user-2")}; theme=dark`;
    expect(extractDistinctIdFromCookies(cookie)).toBe("user-2");
  });

  it("(BUG) does NOT match cookies with underscores in the project key portion", () => {
    // Pinning the regex constraint that's load-bearing for the broken behaviour.
    const cookie = `ph_phc_with_underscore_posthog=${POSTHOG_DATA("user-x")}`;
    expect(extractDistinctIdFromCookies(cookie)).toBeUndefined();
  });

  it("returns undefined when the matched cookie value is URL-encoded garbage", () => {
    // decodeURIComponent on broken %-sequences throws — swallowed.
    const cookie = "ph_phc_x_posthog=%E0%A4%A";
    expect(extractDistinctIdFromCookies(cookie)).toBeUndefined();
  });
});
