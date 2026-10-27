import { describe, expect, it } from "vitest";

import { gardenEnglishTitle } from "@/scrapers/cinemas/garden-performance";
import { peelGenesisStrand } from "@/scrapers/cinemas/genesis";
import { cleanFilmTitle } from "./film-title-cleaner";
import {
  GARDEN_FLAMENCO,
  GARDEN_SONG_OF_THE_HANDS,
  GENESIS_CROW,
  TITLES_WITH_A_DASH,
} from "./listings-qa-2026-10-27";

describe("27 Oct 2026 stored titles", () => {
  it("folds Garden's bilingual listing onto the English title", () => {
    expect(gardenEnglishTitle(GARDEN_FLAMENCO.from)).toBe(GARDEN_FLAMENCO.to);
    expect(gardenEnglishTitle(GARDEN_SONG_OF_THE_HANDS.from)).toBe(GARDEN_SONG_OF_THE_HANDS.to);
    expect(gardenEnglishTitle(GARDEN_SONG_OF_THE_HANDS.withYear)).toBe(GARDEN_SONG_OF_THE_HANDS.to);
  });

  it("peels the Genesis strand and leaves other dashed titles whole", () => {
    expect(peelGenesisStrand(GENESIS_CROW.from)).toEqual({
      title: GENESIS_CROW.to,
      note: GENESIS_CROW.note,
    });
    for (const title of TITLES_WITH_A_DASH) {
      expect(peelGenesisStrand(title), title).toBeNull();
      expect(cleanFilmTitle(title), title).toBe(title);
    }
  });
});
