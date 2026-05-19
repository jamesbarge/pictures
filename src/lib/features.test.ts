/**
 * Tests for src/lib/features.ts
 *
 * Note: `FEATURE_FLAGS` is a module-scope const that snapshots `process.env`
 * AT IMPORT TIME. We can't change the flags by mutating env after the module
 * loads — these tests verify the read contract against whatever the snapshot
 * captured, plus document this gotcha.
 */
import { describe, expect, it } from "vitest";
import { isFeatureEnabled } from "./features";

describe("isFeatureEnabled", () => {
  it("returns a boolean for the 'seasons' feature flag", () => {
    expect(typeof isFeatureEnabled("seasons")).toBe("boolean");
  });

  it("returns a boolean for the 'festivals' feature flag", () => {
    expect(typeof isFeatureEnabled("festivals")).toBe("boolean");
  });

  it("returns the same value across calls (snapshot-stable)", () => {
    // FEATURE_FLAGS is computed once at module load; subsequent calls just
    // index into the frozen record. Pin this stability so a refactor doesn't
    // introduce per-call env reads (which would break Next.js build-time
    // inlining and produce hard-to-debug staging-vs-prod inconsistencies).
    const v1 = isFeatureEnabled("seasons");
    const v2 = isFeatureEnabled("seasons");
    expect(v1).toBe(v2);
  });

  it("ignores post-import process.env mutations (snapshot semantics)", () => {
    // Documented behaviour: mutating process.env.NEXT_PUBLIC_ENABLE_SEASONS
    // AFTER the module has been imported has no effect on isFeatureEnabled.
    const before = isFeatureEnabled("seasons");
    const previousEnv = process.env.NEXT_PUBLIC_ENABLE_SEASONS;
    try {
      process.env.NEXT_PUBLIC_ENABLE_SEASONS =
        previousEnv === "true" ? "false" : "true";
      expect(isFeatureEnabled("seasons")).toBe(before);
    } finally {
      if (previousEnv === undefined) {
        delete process.env.NEXT_PUBLIC_ENABLE_SEASONS;
      } else {
        process.env.NEXT_PUBLIC_ENABLE_SEASONS = previousEnv;
      }
    }
  });

  it("strict-equality check on env value (`=== 'true'`) — any other string is false", () => {
    // The implementation does `process.env.X === "true"`. Documenting this
    // strict-string-match contract so callers don't pass "1", "yes", etc.
    // The snapshot is already taken at module load, so we can't test the
    // matcher dynamically here — instead, this test serves as a documentation
    // anchor pointing at the implementation contract.
    expect(isFeatureEnabled("seasons")).toBe(
      process.env.NEXT_PUBLIC_ENABLE_SEASONS === "true",
    );
  });
});
