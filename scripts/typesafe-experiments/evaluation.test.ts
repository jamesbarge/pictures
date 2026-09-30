// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapConcurrent } from "./evaluation";

describe("experiment queue", () => {
  it("bounds concurrency and preserves input order", async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapConcurrent([3, 2, 1, 0, 4], async value => {
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setTimeout(resolve, value));
      active--;
      return value * 2;
    }, 2);
    expect(result).toEqual([6, 4, 2, 0, 8]);
    expect(maximum).toBe(2);
  });
  it("stops scheduling after failure and waits for outstanding work", async () => {
    const started: number[] = [];
    let completed = false;
    await expect(mapConcurrent([0, 1, 2, 3], async value => {
      started.push(value);
      if (value === 0) throw new Error("stop");
      await new Promise(resolve => setTimeout(resolve, 5));
      completed = true;
    }, 2)).rejects.toThrow("stop");
    expect(started).toEqual([0, 1]);
    expect(completed).toBe(true);
  });
});
