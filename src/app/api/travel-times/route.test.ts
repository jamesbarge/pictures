import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { POST } from "./route";

describe("Travel times API rate limiting", () => {
  it("protects the paid Google API route with the standard 429 envelope", async () => {
    const makeRequest = () =>
      new Request("http://localhost/api/travel-times", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.200",
        },
        body: "{}",
      });

    for (let request = 0; request < RATE_LIMITS.paidApi.limit; request++) {
      expect((await POST(makeRequest())).status).toBe(400);
    }

    const response = await POST(makeRequest());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Too many requests",
      code: "RATE_LIMITED",
    });
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
