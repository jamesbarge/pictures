/**
 * Tests for `runAllStorageMigrations` from src/stores/utils/migrate-storage.ts.
 *
 * Uses the jsdom global `localStorage` provided by vitest's `environment: jsdom`
 * config (see vitest.config.ts) — no manual stubs needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAllStorageMigrations } from "./migrate-storage";

const KEY_PAIRS = [
  ["postboxd-filters", "pictures-filters"],
  ["postboxd-preferences", "pictures-preferences"],
  ["postboxd-film-status", "pictures-film-status"],
  ["postboxd-discovery", "pictures-discovery"],
  ["postboxd-cookie-consent", "pictures-cookie-consent"],
  ["postboxd-reachable", "pictures-reachable"],
  ["postboxd-festivals", "pictures-festivals"],
] as const;

describe("runAllStorageMigrations", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("migrates a single old key to the new key when only old key exists", () => {
    localStorage.setItem("postboxd-filters", "test-data");
    runAllStorageMigrations();
    expect(localStorage.getItem("postboxd-filters")).toBeNull();
    expect(localStorage.getItem("pictures-filters")).toBe("test-data");
  });

  it("prefers existing new-key data and CLEANS UP the old key when both exist", () => {
    localStorage.setItem("postboxd-filters", "OLD-data");
    localStorage.setItem("pictures-filters", "NEW-data");
    runAllStorageMigrations();
    // Old removed, new preserved.
    expect(localStorage.getItem("postboxd-filters")).toBeNull();
    expect(localStorage.getItem("pictures-filters")).toBe("NEW-data");
  });

  it("leaves new key untouched when only new key exists", () => {
    localStorage.setItem("pictures-preferences", "fresh-install-data");
    runAllStorageMigrations();
    expect(localStorage.getItem("pictures-preferences")).toBe("fresh-install-data");
  });

  it("is a no-op when neither key exists", () => {
    runAllStorageMigrations();
    expect(localStorage.getItem("postboxd-filters")).toBeNull();
    expect(localStorage.getItem("pictures-filters")).toBeNull();
  });

  it("migrates all configured key pairs in a single call", () => {
    // Seed all old keys with unique sentinel values.
    for (const [oldKey] of KEY_PAIRS) {
      localStorage.setItem(oldKey, `data-for-${oldKey}`);
    }

    runAllStorageMigrations();

    for (const [oldKey, newKey] of KEY_PAIRS) {
      expect(localStorage.getItem(oldKey)).toBeNull();
      expect(localStorage.getItem(newKey)).toBe(`data-for-${oldKey}`);
    }
  });

  it("only logs a summary when at least one migration occurred", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runAllStorageMigrations();
    // No old keys present → no summary log
    expect(
      logSpy.mock.calls.some((c) =>
        String(c[0]).includes("Completed"),
      ),
    ).toBe(false);

    logSpy.mockClear();
    localStorage.setItem("postboxd-filters", "x");
    runAllStorageMigrations();
    // Summary log appears
    expect(
      logSpy.mock.calls.some((c) =>
        String(c[0]).includes("Completed 1 migrations"),
      ),
    ).toBe(true);
  });

  it("is idempotent (running twice produces same end state, no errors)", () => {
    localStorage.setItem("postboxd-cookie-consent", "accepted");
    runAllStorageMigrations();
    runAllStorageMigrations();
    expect(localStorage.getItem("pictures-cookie-consent")).toBe("accepted");
    expect(localStorage.getItem("postboxd-cookie-consent")).toBeNull();
  });
});
