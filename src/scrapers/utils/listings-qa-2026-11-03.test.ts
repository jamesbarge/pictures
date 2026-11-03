import { describe, expect, it } from "vitest";

import { cleanFilmTitle, guestAppearanceNote, londonPreviewNote, programmeStrandNote } from "./film-title-cleaner";
import {
  CASTLE_BIOGRAPHY,
  COSMOPOLIS,
  GARDEN_STRAND_COSMOPOLIS,
  GARDEN_YEAR_COSMOPOLIS,
  HELL_ON_EARTH,
  KEN_RUSSELLS_DEVILS,
  MY_POLITICAL_BIOGRAPHY,
  POSSESSIVE_TITLES_THAT_STAY,
  STORED_TITLE_REPAIRS,
  TERRORISTS,
  TERRORISTS_RAW,
  THE_DEVILS,
  pickRepairedFilm,
  resolveDirectorPossessive,
  type RepairFilm,
} from "./listings-qa-2026-11-03";

const devils: RepairFilm = {
  id: "005a1c9d-cdb1-414e-87fa-9cd24fb9bdf1",
  title: THE_DEVILS,
  year: 1971,
  tmdbId: 10613,
  directors: ["Ken Russell"],
};

const junkDevils: RepairFilm = {
  id: "4cfef026-2aa7-4724-8795-acd0188f7cdf",
  title: KEN_RUSSELLS_DEVILS,
  year: null,
  tmdbId: null,
  directors: [],
};

const catalog: RepairFilm[] = [
  devils,
  junkDevils,
  {
    id: "hell",
    title: HELL_ON_EARTH,
    year: 2002,
    tmdbId: 2,
    directors: ["Paul Joyce"],
  },
  {
    id: "schindler",
    title: "Schindler's List",
    year: 1993,
    tmdbId: 3,
    directors: ["Steven Spielberg"],
  },
  {
    id: "ferris",
    title: "Ferris Bueller's Day Off",
    year: 1986,
    tmdbId: 4,
    directors: ["John Hughes"],
  },
  {
    id: "rosemary",
    title: "Rosemary's Baby",
    year: 1968,
    tmdbId: 5,
    directors: ["Roman Polanski"],
  },
  {
    id: "wedding",
    title: "My Brother's Wedding",
    year: 1983,
    tmdbId: 6,
    directors: ["Charles Burnett"],
  },
  {
    id: "bram",
    title: "Bram Stoker's Dracula",
    year: 1992,
    tmdbId: 7,
    directors: ["Francis Ford Coppola"],
  },
  {
    id: "dracula-1931",
    title: "Dracula",
    year: 1931,
    tmdbId: 8,
    directors: ["Tod Browning"],
  },
  {
    id: "lee",
    title: "Lee Cronin's The Mummy",
    year: 2026,
    tmdbId: 9,
    directors: ["Lee Cronin"],
  },
  {
    id: "mummy-1999",
    title: "The Mummy",
    year: 1999,
    tmdbId: 10,
    directors: ["Stephen Sommers"],
  },
  {
    id: "mary",
    title: "Mary Shelley's Frankenstein",
    year: 1994,
    tmdbId: 11,
    directors: ["Kenneth Branagh"],
  },
  {
    id: "zombie",
    title: "Rob Zombie's Halloween",
    year: 2007,
    tmdbId: 12,
    directors: ["Rob Zombie"],
  },
  {
    id: "halloween-1978",
    title: "Halloween",
    year: 1978,
    tmdbId: 13,
    directors: ["John Carpenter"],
  },
  {
    id: "day-off",
    title: "Day Off",
    year: 1990,
    tmdbId: 14,
    directors: ["Someone Else"],
  },
];

describe("3 Nov 2026 live titles", () => {
  it("cleans each stored title to the film the repair names", () => {
    expect(STORED_TITLE_REPAIRS.map((repair) => repair.from)).toEqual([
      KEN_RUSSELLS_DEVILS,
      GARDEN_STRAND_COSMOPOLIS,
      GARDEN_YEAR_COSMOPOLIS,
      TERRORISTS_RAW,
      CASTLE_BIOGRAPHY,
    ]);
    // The director credit is resolved against the catalogue, not by the regex.
    expect(cleanFilmTitle(KEN_RUSSELLS_DEVILS)).toBe(KEN_RUSSELLS_DEVILS);
    expect(cleanFilmTitle(GARDEN_STRAND_COSMOPOLIS)).toBe(COSMOPOLIS);
    expect(cleanFilmTitle(GARDEN_YEAR_COSMOPOLIS)).toBe(COSMOPOLIS);
    expect(cleanFilmTitle(TERRORISTS_RAW)).toBe(TERRORISTS);
    expect(cleanFilmTitle(CASTLE_BIOGRAPHY)).toBe(MY_POLITICAL_BIOGRAPHY);
    expect(guestAppearanceNote(GARDEN_YEAR_COSMOPOLIS)).toBe("with Ben Rivers");
    expect(londonPreviewNote(TERRORISTS_RAW)).toBe("London Preview");
    expect(programmeStrandNote(CASTLE_BIOGRAPHY)).toBe("Trans Awareness Programme 2026");
  });

  it("resolves Ken Russell's The Devils onto The Devils (1971) and leaves the others", () => {
    expect(resolveDirectorPossessive(KEN_RUSSELLS_DEVILS, catalog)?.id).toBe(devils.id);
    expect(resolveDirectorPossessive(HELL_ON_EARTH, catalog)).toBeNull();
    for (const title of POSSESSIVE_TITLES_THAT_STAY) {
      expect(resolveDirectorPossessive(title, catalog)).toBeNull();
      expect(cleanFilmTitle(title)).toBe(title);
    }
  });

  it("uses The Devils when that row has no directors yet and it is the only match", () => {
    const undirected: RepairFilm = { ...devils, directors: [], tmdbId: null };
    expect(resolveDirectorPossessive(KEN_RUSSELLS_DEVILS, [undirected, junkDevils])?.id).toBe(devils.id);
  });

  it("does not use a The Devils directed by somebody else", () => {
    const other: RepairFilm = { ...devils, directors: ["Someone Else"] };
    expect(resolveDirectorPossessive(KEN_RUSSELLS_DEVILS, [other, junkDevils])).toBeNull();
  });

  it("still peels when the junk row has been given a year, and picks 1971 over a later namesake", () => {
    const enrichedJunk: RepairFilm = { ...junkDevils, year: 1971, directors: ["Ken Russell"] };
    expect(resolveDirectorPossessive(KEN_RUSSELLS_DEVILS, [enrichedJunk, devils])?.id).toBe(devils.id);

    const later: RepairFilm = { ...devils, id: "devils-2002", year: 2002, tmdbId: 999 };
    expect(resolveDirectorPossessive(KEN_RUSSELLS_DEVILS, [later, devils, junkDevils])?.id).toBe(devils.id);
  });

  it("keeps Lee Cronin's The Mummy when that title is itself a catalogued film", () => {
    const mummy: RepairFilm = {
      id: "mummy-lee",
      title: "The Mummy",
      year: 2026,
      tmdbId: 50,
      directors: ["Lee Cronin"],
    };
    expect(resolveDirectorPossessive("Lee Cronin's The Mummy", [mummy])).toBe(mummy);
    const catalogued: RepairFilm = {
      id: "lee-title",
      title: "Lee Cronin's The Mummy",
      year: 2026,
      tmdbId: 51,
      directors: ["Lee Cronin"],
    };
    expect(resolveDirectorPossessive("Lee Cronin's The Mummy", [mummy, catalogued])).toBeNull();
  });

  it("picks the 1971 Devils and the 2012 Cosmopolis, not a namesake", () => {
    const repair = STORED_TITLE_REPAIRS[0];
    const namesake: RepairFilm = { ...devils, id: "other-devils", year: 2002, directors: ["Ken Russell"] };
    expect(pickRepairedFilm([namesake], repair)).toBeUndefined();
    expect(pickRepairedFilm([namesake, devils], repair)?.id).toBe(devils.id);

    const cosmopolis = STORED_TITLE_REPAIRS[2];
    const wrongYear: RepairFilm = {
      id: "cosmo-1999",
      title: COSMOPOLIS,
      year: 1999,
      tmdbId: 99,
      directors: ["David Cronenberg"],
    };
    const right: RepairFilm = {
      id: "cosmo-2012",
      title: COSMOPOLIS,
      year: 2012,
      tmdbId: 100,
      directors: ["David Cronenberg"],
    };
    expect(pickRepairedFilm([wrongYear], cosmopolis)).toBeUndefined();
    expect(pickRepairedFilm([wrongYear, right], cosmopolis)?.id).toBe("cosmo-2012");
  });
});
