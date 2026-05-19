/**
 * Tests for src/db/safe-query.ts.
 *
 * `hasDatabaseUrl` is computed at module load time from process.env, so the
 * tests' behaviour depends on whether DATABASE_URL is set when vitest runs.
 * We test both branches via vi.resetModules() + dynamic re-import.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;

async function importWithDbUrl(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = value;
  }
  return await import("./safe-query");
}

describe("safeQuery", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB_URL;
    vi.resetModules();
  });

  it("returns the query result when DATABASE_URL is set and query succeeds", async () => {
    const { safeQuery } = await importWithDbUrl(
      "postgres://user:pass@db.example.com:5432/prod",
    );
    const result = await safeQuery(async () => "hello", "fallback");
    expect(result).toBe("hello");
  });

  it("returns fallback when DATABASE_URL is missing (no query execution)", async () => {
    const { safeQuery } = await importWithDbUrl(undefined);
    const queryFn = vi.fn(async () => "never");
    const result = await safeQuery(queryFn, "fallback-value");
    expect(result).toBe("fallback-value");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("returns fallback when DATABASE_URL is empty string", async () => {
    const { safeQuery } = await importWithDbUrl("");
    const queryFn = vi.fn(async () => "never");
    const result = await safeQuery(queryFn, "default");
    expect(result).toBe("default");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("treats localhost:5432/postgres as 'no DATABASE_URL' (fallback path)", async () => {
    // The implementation explicitly excludes the localhost dev URL so that
    // builds in CI don't try to connect to a non-existent local postgres.
    // Pinning this branch.
    const { safeQuery } = await importWithDbUrl(
      "postgres://postgres:postgres@localhost:5432/postgres",
    );
    const queryFn = vi.fn(async () => "never");
    const result = await safeQuery(queryFn, "fb");
    expect(result).toBe("fb");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("returns fallback (and swallows error) when query throws", async () => {
    const { safeQuery } = await importWithDbUrl(
      "postgres://u:p@db.example.com:5432/prod",
    );
    const result = await safeQuery(
      async () => {
        throw new Error("connection refused");
      },
      "error-fallback",
    );
    expect(result).toBe("error-fallback");
  });

  it("logs the error to console.error on failure (observable)", async () => {
    const { safeQuery } = await importWithDbUrl(
      "postgres://u:p@db.example.com:5432/prod",
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await safeQuery(
      async () => {
        throw new Error("boom");
      },
      "fb",
    );
    expect(errorSpy).toHaveBeenCalled();
    const firstCall = errorSpy.mock.calls[0];
    expect(firstCall[0]).toMatch(/Query failed/);
  });
});

describe("isDatabaseAvailable", () => {
  afterEach(() => {
    if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB_URL;
    vi.resetModules();
  });

  it("returns true when DATABASE_URL is a real production-style URL", async () => {
    const { isDatabaseAvailable } = await importWithDbUrl(
      "postgres://u:p@db.example.com:5432/prod",
    );
    expect(isDatabaseAvailable()).toBe(true);
  });

  it("returns false when DATABASE_URL is unset", async () => {
    const { isDatabaseAvailable } = await importWithDbUrl(undefined);
    expect(isDatabaseAvailable()).toBe(false);
  });

  it("returns false for the localhost-postgres dev URL", async () => {
    const { isDatabaseAvailable } = await importWithDbUrl(
      "postgres://postgres:postgres@localhost:5432/postgres",
    );
    expect(isDatabaseAvailable()).toBe(false);
  });
});
