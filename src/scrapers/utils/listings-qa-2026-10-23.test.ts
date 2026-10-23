import { describe, expect, it } from "vitest";
import { extractFilmTitle } from "@/lib/title-extraction";
import { cleanFilmTitle, cleanFilmTitleWithMetadata } from "./film-title-cleaner";
import {
  chooseListingCanonical,
  isCurzonDocHouseDuplicate,
  listingTitlePlan,
  partListingTargets,
  type RepairFilm,
} from "./listings-qa-2026-10-23";

/** The title getOrCreateFilm stores: cleaner wins when it peeled an extra. */
async function pipelineTitle(raw: string): Promise<{ title: string; year: number | null }> {
  const extraction = await extractFilmTitle(raw);
  let cleanedTitle = cleanFilmTitle(extraction.filmTitle || raw);
  if (
    (extraction.confidence === "low" || extraction.confidence === "medium")
    && !extraction.canonicalTitle
  ) {
    cleanedTitle = cleanFilmTitle(raw);
  }
  let matching = extraction.canonicalTitle ? cleanFilmTitle(extraction.canonicalTitle) : cleanedTitle;
  const listing = cleanFilmTitleWithMetadata(raw);
  if (listing.eventNote && listing.cleanedTitle) matching = listing.cleanedTitle;
  return { title: matching, year: listing.extractedYear ?? null };
}

const film = (partial: Partial<RepairFilm> & Pick<RepairFilm, "id" | "title">): RepairFilm => ({
  year: null,
  tmdbId: null,
  posterUrl: null,
  ...partial,
});

describe("23 Oct 2026 pipeline titles", () => {
  it.each([
    ["'Wicker Sour' cocktails, straw man making + Wicker", "Wicker", null],
    ["Taiwanese nibbles, traditional drinks + The Dull Ice Flower", "The Dull Ice Flower", null],
    ["Endless Night (1972) + The Swinging Christies LIVE!", "Endless Night", 1972],
    ["Halloween (1978)- Halloween at Genesis", "Halloween", 1978],
  ])("stores %s as the film", async (raw, title, year) => {
    await expect(pipelineTitle(raw)).resolves.toEqual({ title, year });
  });

  it("keeps genuine double bills", async () => {
    await expect(pipelineTitle("Blacula + Ma")).resolves.toMatchObject({ title: "Blacula + Ma" });
    await expect(pipelineTitle("Nishi Ginza Station + My Second Brother")).resolves.toMatchObject({
      title: "Nishi Ginza Station + My Second Brother",
    });
    expect(listingTitlePlan("Blacula + Ma")).toBeNull();
    expect(listingTitlePlan("Nishi Ginza Station + My Second Brother")).toBeNull();
  });
});

describe("stored-row plans", () => {
  it("plans each live title and the note", () => {
    expect(listingTitlePlan("'Wicker Sour' cocktails, straw man making + Wicker")).toEqual({
      title: "Wicker",
      year: null,
      eventNote: "'Wicker Sour' cocktails, straw man making",
    });
    expect(listingTitlePlan("Taiwanese nibbles, traditional drinks + The Dull Ice Flower")?.title).toBe(
      "The Dull Ice Flower",
    );
    expect(listingTitlePlan("Endless Night (1972) + The Swinging Christies LIVE!")).toMatchObject({
      title: "Endless Night",
      year: 1972,
      eventNote: "The Swinging Christies LIVE!",
    });
    expect(listingTitlePlan("Halloween (1978)- Halloween at Genesis")).toMatchObject({
      title: "Halloween",
      year: 1978,
    });
  });

  it("points Battle of Chile parts at the short titles and ignores double bills", () => {
    expect(partListingTargets(
      "The Battle of Chile, Part 1: The Insurrection of the Bourgeoisie",
    )).toEqual(["The Battle of Chile: Part I", "The Battle of Chile: Part 1"]);
    expect(partListingTargets("The Battle of Chile, Part 2: The Coup D’Etat")).toContain(
      "The Battle of Chile: Part II",
    );
    expect(partListingTargets("The Battle of Chile, Part 3: The Power of the People")).toContain(
      "The Battle of Chile: Part III",
    );
    expect(partListingTargets("Blacula + Ma")).toEqual([]);
    expect(partListingTargets("Halloween II")).toEqual([]);
    expect(partListingTargets("Dune: Part Two")).toEqual([]);
  });

  it("repoints onto the stronger same-year film and refuses a year clash", () => {
    const self = film({
      id: "bad",
      title: "'Wicker Sour' cocktails, straw man making + Wicker",
      year: 2026,
    });
    const wicker = film({ id: "good", title: "Wicker", year: 2026, tmdbId: 50, posterUrl: "p" });
    const old = film({ id: "old", title: "Wicker", year: 1920, tmdbId: 9 });
    expect(chooseListingCanonical(self, [wicker, old], { year: null })?.id).toBe("good");
    expect(chooseListingCanonical(
      film({ id: "h", title: "Halloween (1978)- Halloween at Genesis" }),
      [film({ id: "1978", title: "Halloween", year: 1978, tmdbId: 1 }), film({ id: "2018", title: "Halloween", year: 2018, tmdbId: 2 })],
      { year: 1978 },
    )?.id).toBe("1978");
  });

  it("recognises the Curzon DocHouse booking URL", () => {
    expect(isCurzonDocHouseDuplicate(
      "curzon-bloomsbury",
      "https://www.curzon.com/films/dochouse-the-eyes-of-ghana/HO00007406/",
    )).toBe(true);
    expect(isCurzonDocHouseDuplicate(
      "curzon-bloomsbury",
      "https://www.curzon.com/films/the-drama/HO00017563/",
    )).toBe(false);
    expect(isCurzonDocHouseDuplicate(
      "curzon-soho",
      "https://www.curzon.com/films/dochouse-the-eyes-of-ghana/HO00007406/",
    )).toBe(false);
  });
});
