import { describe, expect, it } from "vitest";
import { riversideFilmMetadata } from "./riverside-v2";

/** `search` HTML verbatim from the Riverside filter_stream feed on 2026-10-16 (event 5641). */
const hammerDracula =
  "<p>Director: <strong>Terence Fisher</strong></p><p>Cast: <strong>Peter Cushing, Michael Gough, Melissa Stribling, Christopher Lee</strong></p><p>Company: <strong>Hammer</strong></p><p>Trailers: <strong>20 mins</strong></p><p>Year of Release: <strong>1958</strong></p><p>&nbsp;</p> Dracula: 4K Restoration";

describe("riversideFilmMetadata", () => {
  it("reads the labelled director and release year", () => {
    expect(riversideFilmMetadata(hammerDracula)).toEqual({ year: 1958, director: "Terence Fisher" });
  });

  it("reads the table-row form used by new releases", () => {
    // Event "Digger", same feed and day.
    const digger =
      "<table><tbody><tr><td><strong>Director:</strong></td><td>Alejandro González Iñárritu</td></tr><tr><td><strong>Cast:</strong></td><td>Tom Cruise</td></tr><tr><td><strong>Year of Release:</strong></td><td>2026</td></tr></tbody></table>";
    expect(riversideFilmMetadata(digger)).toEqual({ year: 2026, director: "Alejandro González Iñárritu" });
  });

  it("returns nothing for events without the labels", () => {
    expect(riversideFilmMetadata("<p>A live comedy night.</p>")).toEqual({ year: undefined, director: undefined });
    expect(riversideFilmMetadata(undefined)).toEqual({ year: undefined, director: undefined });
  });

  it("ignores a year mentioned in the synopsis", () => {
    expect(riversideFilmMetadata("<p>first released in 1958 in Japan</p>").year).toBeUndefined();
  });

  it("decodes entities, reads Directors:, and skips other credits ending in Director:", () => {
    expect(riversideFilmMetadata("<p>Director: <strong>Agn&egrave;s Varda</strong></p>").director).toBe("Agnès Varda");
    expect(riversideFilmMetadata("<p>Directors: <strong>Jeunet &amp; Caro</strong></p>").director).toBe("Jeunet & Caro");
    expect(
      riversideFilmMetadata("<p>Music Director: <strong>A Conductor</strong></p><p>Director: <strong>Real Name</strong></p>").director,
    ).toBe("Real Name");
  });
});
