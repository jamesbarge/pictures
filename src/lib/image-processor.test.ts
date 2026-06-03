import { afterEach, describe, expect, it, vi } from "vitest";
import { isImageAccessible } from "./image-processor";

const originalFetch = globalThis.fetch;

function imageResponse(status: number, contentType: string | null): Response {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return new Response("", { status, headers });
}

describe("isImageAccessible", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns true for 200 + image/* content-type", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(imageResponse(200, "image/jpeg"));
    expect(await isImageAccessible("https://example.com/foo.jpg")).toBe(true);
  });

  it("returns true for image/png", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(imageResponse(200, "image/png"));
    expect(await isImageAccessible("https://example.com/foo.png")).toBe(true);
  });

  it("returns false for 200 + non-image content-type (e.g. text/html)", async () => {
    // Common case: the URL returns a 404-styled HTML page with 200 status.
    globalThis.fetch = vi.fn().mockResolvedValue(imageResponse(200, "text/html"));
    expect(await isImageAccessible("https://example.com/notfound")).toBe(false);
  });

  it("returns false for 404 even with image content-type", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(imageResponse(404, "image/jpeg"));
    expect(await isImageAccessible("https://example.com/foo.jpg")).toBe(false);
  });

  it("returns false for 5xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(imageResponse(503, "image/jpeg"));
    expect(await isImageAccessible("https://example.com/foo.jpg")).toBe(false);
  });

  it("returns false when network error throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await isImageAccessible("https://example.com/foo.jpg")).toBe(false);
  });

  it("returns false when content-type header is missing", async () => {
    // Implementation does `|| ""` then `.startsWith("image/")` → false.
    globalThis.fetch = vi.fn().mockResolvedValue(imageResponse(200, null));
    expect(await isImageAccessible("https://example.com/foo.jpg")).toBe(false);
  });

  it("uses HEAD method with a Mozilla-prefixed User-Agent header", async () => {
    const mock = vi.fn().mockResolvedValue(imageResponse(200, "image/jpeg"));
    globalThis.fetch = mock;
    await isImageAccessible("https://example.com/foo.jpg");
    expect(mock).toHaveBeenCalledWith(
      "https://example.com/foo.jpg",
      expect.objectContaining({
        method: "HEAD",
        headers: expect.objectContaining({
          "User-Agent": expect.stringMatching(/^Mozilla\/5\.0/),
        }),
      }),
    );
  });
});
