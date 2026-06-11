import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { screenings } from "./screenings";

describe("screenings schema indexes", () => {
  it("declares the partial source-ID index used by scraper upserts", () => {
    const index = getTableConfig(screenings).indexes.find(
      (candidate) => candidate.config.name === "idx_screenings_cinema_source"
    );

    expect(index).toBeDefined();
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((column) => "name" in column ? column.name : null))
      .toEqual(["cinema_id", "source_id"]);
    expect(index?.config.where).toBeDefined();
  });
});
