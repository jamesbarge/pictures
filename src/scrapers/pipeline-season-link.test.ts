/**
 * Season linking must never cost a film its screenings.
 *
 * Observed 2026-08-25: under Supabase pooler contention,
 * `linkFilmToMatchingSeasons: <title> timeout after 10000ms (client-side)`
 * was thrown by withDbTimeout from *inside* the film-level try block, and
 * *ahead* of the screening insert loop. The film-level catch then did
 * `result.failed += filmScreenings.length - settled` with settled still 0,
 * so the film's entire screening list was counted failed and never written.
 * Those writes never reached attemptScreeningWrite either, so the
 * deferred-write retry pass could not recover them. 44 films were lost in
 * one run, and the resulting failed-write counts (curzon-camden 224,
 * everyman-hampstead 107 of 107) suppressed superseded cleanup at those
 * venues via shouldRunSupersededCleanup.
 *
 * Season membership is cosmetic enrichment. The contract these tests pin is
 * that its failure is absorbed and reported, never propagated.
 *
 * SCOPE LIMIT, so the next reader is not misled: these cover the swallow only.
 * They all still pass if the call is moved back ahead of the insert loop, which
 * is the defect itself. Covering position would mean mocking `db`, plus the
 * module-private `getOrCreateFilm` and `insertScreening`, to drive
 * `processScreenings` end to end; no test in this repo does that today. Until
 * one does, the call site's position after the loop is held by review, not by a
 * test. If you move it, nothing here will stop you.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { linkSeasonsBestEffort } from "./pipeline";
import { linkFilmToMatchingSeasons } from "./seasons/season-linker";

vi.mock("./seasons/season-linker", () => ({
  linkFilmToMatchingSeasons: vi.fn(),
}));

const mockedLink = vi.mocked(linkFilmToMatchingSeasons);

/** The exact shape withDbTimeout rejects with under pool contention. */
const clientSideTimeout = (title: string) =>
  new Error(`linkFilmToMatchingSeasons: ${title} timeout after 10000ms (client-side)`);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  mockedLink.mockReset();
});

describe("linkSeasonsBestEffort", () => {
  it("returns the link count on success", async () => {
    mockedLink.mockResolvedValue(2);
    await expect(linkSeasonsBestEffort("film-1", "Orlando")).resolves.toBe(2);
    expect(mockedLink).toHaveBeenCalledWith("film-1", "Orlando");
  });

  it("returns 0 rather than throwing on a client-side pool timeout", async () => {
    mockedLink.mockRejectedValue(clientSideTimeout("Curzon Film 50: Orlando"));
    await expect(linkSeasonsBestEffort("film-1", "Curzon Film 50: Orlando")).resolves.toBe(0);
  });

  it("absorbs non-connection failures too, so enrichment never fails the film", async () => {
    // A season-side FK violation is still not a reason to drop screenings.
    mockedLink.mockRejectedValue(
      new Error('insert or update on table "season_films" violates foreign key constraint'),
    );
    await expect(linkSeasonsBestEffort("film-1", "Volver")).resolves.toBe(0);
  });

  it("reports the skip so a silent enrichment gap is still visible in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedLink.mockRejectedValue(clientSideTimeout("Tony"));

    await linkSeasonsBestEffort("film-1", "Tony");

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Season linking skipped for "Tony"'),
      expect.any(Error),
    );
  });
});
