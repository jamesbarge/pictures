import { describe, it, expect } from "vitest";
import { buildCatalogIndexes, searchCatalog, type CatalogResponse } from "./catalog-index-core";

const fixture: CatalogResponse = {
  films: [
    { id: "f1", title: "Amélie", year: 2001, directors: ["Jean-Pierre Jeunet"], posterUrl: null },
    { id: "f2", title: "Taxi Driver", year: 1976, directors: ["Martin Scorsese"], posterUrl: null },
    { id: "f3", title: "The Godfather", year: 1972, directors: ["Francis Ford Coppola"], posterUrl: null },
    { id: "f4", title: "Parasite", year: 2019, directors: ["Bong Joon-ho"], posterUrl: null },
  ],
  cinemas: [
    { id: "bfi-southbank", name: "BFI Southbank", shortName: "BFI", area: "Southbank" },
    { id: "prince-charles", name: "Prince Charles Cinema", shortName: "PCC", area: "Leicester Square" },
  ],
  people: [
    { name: "Martin Scorsese", role: "director", filmCount: 3 },
    { name: "Jean-Pierre Jeunet", role: "director", filmCount: 1 },
  ],
};

describe("catalog client index", () => {
  const idx = buildCatalogIndexes(fixture);

  it("finds a film despite a typo + missing accent ('amelei' → Amélie)", () => {
    const { films } = searchCatalog(idx, "amelei");
    expect(films[0]?.title).toBe("Amélie");
  });

  it("matches accented titles from accent-free queries ('amelie' → Amélie)", () => {
    expect(searchCatalog(idx, "amelie").films[0]?.title).toBe("Amélie");
  });

  it("finds a film by its director's name", () => {
    const { films } = searchCatalog(idx, "scorsese");
    expect(films.some((f) => f.title === "Taxi Driver")).toBe(true);
  });

  it("finds a director in the people results (with a typo)", () => {
    const { people } = searchCatalog(idx, "scorses");
    expect(people[0]?.name).toBe("Martin Scorsese");
  });

  it("finds a cinema by name", () => {
    const { cinemas } = searchCatalog(idx, "prince charles");
    expect(cinemas[0]?.id).toBe("prince-charles");
  });

  it("returns the full result objects (kind discriminator preserved)", () => {
    const { films } = searchCatalog(idx, "parasite");
    expect(films[0]).toMatchObject({ kind: "film", id: "f4", year: 2019 });
  });

  it("returns empty for sub-minimum-length queries", () => {
    expect(searchCatalog(idx, "a")).toEqual({ films: [], people: [], cinemas: [] });
  });

  it("does not throw on duplicate ids/names (dedupes before indexing)", () => {
    const dup: CatalogResponse = {
      films: [
        { id: "x", title: "Solaris", year: 1972, directors: ["Andrei Tarkovsky"], posterUrl: null },
        { id: "x", title: "Solaris (dup id)", year: 2002, directors: ["Steven Soderbergh"], posterUrl: null },
      ],
      cinemas: [],
      people: [
        { name: "Andrei Tarkovsky", role: "director", filmCount: 2 },
        { name: "Andrei Tarkovsky", role: "director", filmCount: 9 }, // duplicate name
      ],
    };
    const i = buildCatalogIndexes(dup); // must not throw
    expect(searchCatalog(i, "tarkovsky").people).toHaveLength(1);
    expect(searchCatalog(i, "solaris").films).toHaveLength(1);
  });
});
