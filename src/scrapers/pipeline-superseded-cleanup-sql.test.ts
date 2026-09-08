/**
 * Query-contract tests adapted from C3's historical DELETE characterization.
 * The production helper now emits a read-only candidate COUNT. We assert on
 * its real Drizzle SQL/parameters, not fixture deletion outcomes. No database
 * is used. Predicate semantics remain an inference, not executed SQL evidence.
 *
 * An omitted 18:00 showing can match a refreshed 20:30 same-film showing.
 * That only makes it a review candidate: proximity cannot prove cancellation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const execute = vi.fn();
vi.mock("@/db", () => ({
  db: { execute: (q: unknown) => execute(q) },
  withDbTimeout: <T,>(p: T) => p,
}));

import { reportSupersededScreeningCandidates } from "./pipeline";

const dialect = new PgDialect();
const CINEMA = "peckhamplex";
/** The run's scrapedAt: the freshness cutoff both sides of the query pivot on. */
const SCRAPED_AT = new Date("2026-09-08T11:34:00.000Z");

/** Serialize the query the production function actually handed to db.execute. */
async function capture(): Promise<{ sql: string; params: unknown[] }> {
  execute.mockResolvedValue([{ count: 0 }]);
  await reportSupersededScreeningCandidates(CINEMA, SCRAPED_AT);
  expect(execute).toHaveBeenCalledTimes(1);
  const q = dialect.sqlToQuery(execute.mock.calls[0][0] as SQL);
  return { sql: q.sql.replace(/\s+/g, " ").trim(), params: q.params };
}

beforeEach(() => {
  execute.mockReset();
});

describe("query contract: read-only candidate reporting", () => {
  it("counts candidate rows without emitting any write statement", async () => {
    const { sql } = await capture();
    expect(sql).toMatch(/^SELECT COUNT\(\*\)::integer AS count FROM screenings s\b/);
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  });

  it("binds the cinema id and the run timestamp, and nothing else", async () => {
    const { params } = await capture();
    expect(params).toEqual([
      CINEMA,
      "2026-09-08T11:34:00.000Z",
      "2026-09-08T11:34:00.000Z",
    ]);
  });

  it("uses one identical timestamp for both freshness comparisons", async () => {
    const { params } = await capture();
    // Keep both sides of the diagnostic tied to the same batch cutoff.
    expect(params[1]).toBe(params[2]);
  });

  it("scopes to the venue just scraped on both sides of the EXISTS", async () => {
    const { sql } = await capture();
    expect(sql).toContain("s.cinema_id = $1");
    expect(sql).toContain("s2.cinema_id = s.cinema_id");
  });
});

describe("query contract: source_id plays no part", () => {
  it("does not use source_id: candidates are not confirmed replacements", async () => {
    const { sql } = await capture();
    expect(sql).not.toContain("source_id");
  });

  it("matches the sibling on film_id alone, not on the screening's identity", async () => {
    const { sql } = await capture();
    expect(sql).toContain("s2.film_id = s.film_id");
    // Only self-exclusion stands between "a sibling exists" and "this row's
    // replacement exists". They are not the same claim.
    expect(sql).toContain("s2.id != s.id");
  });
});

describe("query contract: the boundaries, read off the operators", () => {
  it("treats the 3h window as strict, so a gap of exactly 10800s does not match", async () => {
    const { sql } = await capture();
    expect(sql).toContain(
      "ABS(EXTRACT(EPOCH FROM s2.datetime - s.datetime)) < 10800",
    );
    expect(sql).not.toContain("<= 10800");
  });

  it("treats a row scraped exactly at the cutoff as fresh, not stale", async () => {
    const { sql } = await capture();
    expect(sql).toContain("s.scraped_at < $2");
    expect(sql).not.toContain("s.scraped_at <= $2");
  });

  it("counts a sibling scraped exactly at the cutoff as refreshed", async () => {
    const { sql } = await capture();
    expect(sql).toContain("s2.scraped_at >= $3");
    expect(sql).not.toContain("s2.scraped_at > $3");
  });

  it("buckets both sides by London calendar date", async () => {
    const { sql } = await capture();
    expect(sql).toContain(
      "DATE(s2.datetime AT TIME ZONE 'Europe/London') = DATE(s.datetime AT TIME ZONE 'Europe/London')",
    );
  });

  it("restricts the report to future screenings", async () => {
    const { sql } = await capture();
    expect(sql).toContain("s.datetime >= NOW()");
  });
});

describe("return value", () => {
  it("reads the selected aggregate, not the driver's result-row count", async () => {
    execute.mockResolvedValue(Object.assign([{ count: 110 }], { count: 1 }));
    await expect(reportSupersededScreeningCandidates(CINEMA, SCRAPED_AT)).resolves.toBe(110);
  });

  it("reports a successful zero count", async () => {
    execute.mockResolvedValue([{ count: 0 }]);
    await expect(reportSupersededScreeningCandidates(CINEMA, SCRAPED_AT)).resolves.toBe(0);
  });

  it("distinguishes a missing result from zero candidates", async () => {
    execute.mockResolvedValue([]);
    await expect(reportSupersededScreeningCandidates(CINEMA, SCRAPED_AT)).resolves.toBeUndefined();
  });

  it("does not throw or attempt another query when reporting fails", async () => {
    execute.mockRejectedValue(new Error("query timeout"));
    await expect(reportSupersededScreeningCandidates(CINEMA, SCRAPED_AT)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
