import { describe, expect, it } from "vitest";
import { compareFilmsByCalendarPriority } from "@/lib/calendar-sort";

function makeFilm({
  letterboxdRating,
  tmdbPopularity,
  datetime,
}: {
  letterboxdRating: number | null;
  tmdbPopularity: number | null;
  datetime: string;
}) {
  return {
    film: {
      letterboxdRating,
      tmdbPopularity,
    },
    screenings: [{ datetime }],
  };
}

describe("compareFilmsByCalendarPriority", () => {
  it("puts rated films ahead of unrated films", () => {
    const rated = makeFilm({
      letterboxdRating: 3.5,
      tmdbPopularity: 10,
      datetime: "2026-04-23T20:00:00.000Z",
    });
    const unrated = makeFilm({
      letterboxdRating: null,
      tmdbPopularity: 100,
      datetime: "2026-04-23T19:00:00.000Z",
    });

    expect(compareFilmsByCalendarPriority(rated, unrated)).toBeLessThan(0);
  });

  it("sorts rated films by higher Letterboxd rating first", () => {
    const higherRated = makeFilm({
      letterboxdRating: 4.4,
      tmdbPopularity: 10,
      datetime: "2026-04-23T20:00:00.000Z",
    });
    const lowerRated = makeFilm({
      letterboxdRating: 4.1,
      tmdbPopularity: 80,
      datetime: "2026-04-23T19:00:00.000Z",
    });

    expect(compareFilmsByCalendarPriority(higherRated, lowerRated)).toBeLessThan(0);
  });

  it("uses TMDB popularity when Letterboxd ratings are equal", () => {
    const morePopular = makeFilm({
      letterboxdRating: 4.0,
      tmdbPopularity: 90,
      datetime: "2026-04-23T20:00:00.000Z",
    });
    const lessPopular = makeFilm({
      letterboxdRating: 4.0,
      tmdbPopularity: 30,
      datetime: "2026-04-23T19:00:00.000Z",
    });

    expect(compareFilmsByCalendarPriority(morePopular, lessPopular)).toBeLessThan(0);
  });

  it("orders unrated films by TMDB popularity", () => {
    const morePopular = makeFilm({
      letterboxdRating: null,
      tmdbPopularity: 75,
      datetime: "2026-04-23T20:00:00.000Z",
    });
    const lessPopular = makeFilm({
      letterboxdRating: null,
      tmdbPopularity: 12,
      datetime: "2026-04-23T19:00:00.000Z",
    });

    expect(compareFilmsByCalendarPriority(morePopular, lessPopular)).toBeLessThan(0);
  });

  it("falls back to earlier screening time when both metrics are missing", () => {
    const earlier = makeFilm({
      letterboxdRating: null,
      tmdbPopularity: null,
      datetime: "2026-04-23T18:00:00.000Z",
    });
    const later = makeFilm({
      letterboxdRating: null,
      tmdbPopularity: null,
      datetime: "2026-04-23T21:00:00.000Z",
    });

    expect(compareFilmsByCalendarPriority(earlier, later)).toBeLessThan(0);
  });
});
