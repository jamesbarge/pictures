import { describe, expect, it } from "vitest";
import { riversideFilmMetadata } from "./riverside-v2";

/** `search` HTML verbatim from the Riverside filter_stream feed on 2026-10-16 (event 5641). */
const hammerDracula =
  "<p>Director: <strong>Terence Fisher</strong></p><p>Cast: <strong>Peter Cushing, Michael Gough, Melissa Stribling, Christopher Lee</strong></p><p>Company: <strong>Hammer</strong></p><p>Trailers: <strong>20 mins</strong></p><p>Year of Release: <strong>1958</strong></p><p>&nbsp;</p> Dracula: 4K Restoration";

describe("riversideFilmMetadata", () => {
  it("reads the labelled director and release year", () => {
    expect(riversideFilmMetadata(hammerDracula)).toEqual({ year: 1958, director: "Terence Fisher" });
  });

  it("returns nothing for events without the labels", () => {
    expect(riversideFilmMetadata("<p>A live comedy night.</p>")).toEqual({ year: undefined, director: undefined });
    expect(riversideFilmMetadata(undefined)).toEqual({ year: undefined, director: undefined });
  });

  it("ignores a year mentioned in the synopsis", () => {
    expect(riversideFilmMetadata("<p>first released in 1958 in Japan</p>").year).toBeUndefined();
  });
});
