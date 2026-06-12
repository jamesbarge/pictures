import { beforeEach, describe, expect, it, vi } from "vitest";
import { ICAScraper } from "./ica";
import { FestivalDetector } from "../festivals/festival-detector";
import type { RawScreening } from "../types";

/**
 * ICA film-detail-page parsing tests (plan 006).
 *
 * Each ICA film page carries a `#colophon` block in the form
 * "<i>Title</i>, dir Director Name, Country Year, Runtime mins." The scraper
 * has always parsed runtime out of it into a local FilmInfo — these tests
 * pin that the value now flows onto RawScreening.runtime.
 */

function fixturePage({
  title = "The Souvenir",
  colophon = "The Souvenir, dir Joanna Hogg, UK 2019, 96 mins.",
  date = "Fri, 20 Dec 2030",
  time = "06:15 pm",
}: {
  title?: string;
  colophon?: string;
  date?: string;
  time?: string;
} = {}): string {
  return `<html>
    <head>
      <title>ICA | ${title}</title>
      <link rel="canonical" href="https://www.ica.art/films/the-souvenir" />
    </head>
    <body>
      <h1><span class="title">${title}</span></h1>
      <div id="colophon">${colophon}</div>
      <div class="performance-list">
        <div class="performance">
          <span class="date">${date}</span>
          <span class="time">${time}</span>
          <span class="venue">Cinema 1</span>
        </div>
      </div>
    </body>
  </html>`;
}

async function parse(html: string): Promise<RawScreening[]> {
  const scraper = new ICAScraper();
  const internals = scraper as unknown as {
    parsePages: (pages: string[]) => Promise<RawScreening[]>;
  };
  return internals.parsePages([html]);
}

beforeEach(() => {
  vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
});

describe("ICAScraper — colophon runtime → RawScreening.runtime", () => {
  it("forwards the colophon-parsed runtime", async () => {
    const screenings = await parse(fixturePage());
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBe(96);
  });

  it("forwards year and director alongside runtime (regression)", async () => {
    const screenings = await parse(fixturePage());
    expect(screenings[0].year).toBe(2019);
    expect(screenings[0].director).toBe("Joanna Hogg");
    expect(screenings[0].filmTitle).toBe("The Souvenir");
  });

  it("leaves runtime undefined when the colophon has no runtime", async () => {
    const screenings = await parse(
      fixturePage({ colophon: "The Souvenir, dir Joanna Hogg, UK 2019." })
    );
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("drops runtimes outside the 1-600 band", async () => {
    const screenings = await parse(
      fixturePage({ colophon: "Marathon Piece, dir Someone, UK 2019, 5400 mins." })
    );
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBeUndefined();
  });
});
