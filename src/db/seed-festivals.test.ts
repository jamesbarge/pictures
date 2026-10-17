import { describe, it, expect, vi } from "vitest";

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("./index", () => ({ db: { insert, update: vi.fn() } }));

describe("seed-festivals", () => {
  it("does not touch the database when imported", async () => {
    const { londonFestivals } = await import("./seed-festivals");
    expect(londonFestivals.length).toBeGreaterThan(0);
    expect(insert).not.toHaveBeenCalled();
  });
});
