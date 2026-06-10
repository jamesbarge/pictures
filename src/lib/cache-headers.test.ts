import { describe, expect, it } from "vitest";
import {
  CACHE_2MIN,
  CACHE_5MIN,
  getUserAwareCacheHeaders,
  PRIVATE_NO_STORE,
} from "./cache-headers";

describe("getUserAwareCacheHeaders", () => {
  it("keeps public cache headers for anonymous responses", () => {
    expect(getUserAwareCacheHeaders(null, CACHE_2MIN)).toBe(CACHE_2MIN);
    expect(getUserAwareCacheHeaders(null, CACHE_5MIN)).toBe(CACHE_5MIN);
  });

  it("uses private no-store headers for authenticated responses", () => {
    expect(getUserAwareCacheHeaders("user_123", CACHE_2MIN)).toBe(
      PRIVATE_NO_STORE
    );
    expect(PRIVATE_NO_STORE["Cache-Control"]).not.toContain("s-maxage");
  });
});
