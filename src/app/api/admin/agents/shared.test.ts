import { describe, expect, it, vi } from "vitest";
import {
  agentErrorResponse,
  geminiKeyMissingResponse,
} from "./shared";

describe("geminiKeyMissingResponse", () => {
  it("returns a 200 JSON response with success=false", async () => {
    const res = geminiKeyMissingResponse();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.summary).toBe("Agent not configured");
  });

  it("error message mentions GEMINI_API_KEY (greppable in admin UI logs)", async () => {
    const body = await geminiKeyMissingResponse().json();
    expect(body.error).toMatch(/GEMINI_API_KEY/);
    expect(body.error).toMatch(/Vercel/);
  });
});

describe("agentErrorResponse", () => {
  it("returns a 500 JSON response with structured fields", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = agentErrorResponse("Test", "Test op", new Error("boom"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.summary).toBe("Test op failed");
    expect(body.error).toBe("boom");
  });

  it("falls back to 'Unknown error' for non-Error throwables", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = agentErrorResponse("X", "Y", "string thrown");
    const body = await res.json();
    expect(body.error).toBe("Unknown error");
  });

  it("falls back to 'Unknown error' for null/undefined", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await agentErrorResponse("X", "Y", null).json()).error).toBe(
      "Unknown error",
    );
    expect((await agentErrorResponse("X", "Y", undefined).json()).error).toBe(
      "Unknown error",
    );
  });

  it("logs the error with the supplied logPrefix (greppable in CloudWatch)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("xyz");
    agentErrorResponse("[admin-agents-links]", "Op", err);
    expect(spy).toHaveBeenCalledWith("[admin-agents-links] error:", err);
    spy.mockRestore();
  });

  it("composes summaryLabel + ' failed' (consistent suffix for UI parsing)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = agentErrorResponse("X", "Enrichment", new Error("e"));
    expect((await res.json()).summary).toBe("Enrichment failed");
  });
});
