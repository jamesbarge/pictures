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
  bookButton = "",
  venue = "Cinema 1",
}: {
  title?: string;
  colophon?: string;
  date?: string;
  time?: string;
  bookButton?: string;
  venue?: string;
} = {}): string {
  return `<html>
    <head>
      <title>ICA | ${title}</title>
      <link rel="canonical" href="https://www.ica.art/films/the-souvenir" />
    </head>
    <body>
      <h1><span class="title">${title}</span></h1>
      <div id="colophon">${colophon}</div>
      ${bookButton}
      <div class="performance-list">
        <div class="performance">
          <span class="date">${date}</span>
          <span class="time">${time}</span>
          <span class="venue">${venue}</span>
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

describe("ICAScraper — title and booking URL", () => {
  it("separates a strapline split by a line break from the title", async () => {
    // Live markup on /films/off-circuit-the-night-is-fading-away (2026-10-04)
    // uses a malformed </br>; .text() used to fuse it into "UK PREMIEREThe Night...".
    const screenings = await parse(
      fixturePage({ title: "UK PREMIERE</br>The Night is Fading Away + Q&A" })
    );
    expect(screenings[0].filmTitle).toBe("UK PREMIERE The Night is Fading Away + Q&A");
  });

  it("keeps the ICA /book/{id} link when the page has one", async () => {
    const screenings = await parse(
      fixturePage({
        bookButton: `<div class='row select' onclick='location.href="/book/765601";'>Book tickets</div>`,
      })
    );
    expect(screenings[0].bookingUrl).toBe("https://www.ica.art/book/765601");
  });

  it("uses the external seller's link for screenings ICA does not sell (LFF)", async () => {
    const screenings = await parse(
      fixturePage({
        bookButton:
          `<a onclick='javascript:showTrailer();'>View trailer</a>` +
          `<div class='row select' onclick='location.href="https://whatson.bfi.org.uk/lff/Online/article/lali-lff26";'>Book tickets</div>`,
      })
    );
    expect(screenings[0].bookingUrl).toBe("https://whatson.bfi.org.uk/lff/Online/article/lali-lff26");
  });

  it("tolerates a space before the external URL (live /films/lff-florid markup)", async () => {
    const screenings = await parse(
      fixturePage({
        bookButton: `<div class='row select' onclick='location.href=" https://whatson.bfi.org.uk/lff/Online/article/florid-lff26";'>Book tickets</div>`,
      })
    );
    expect(screenings[0].bookingUrl).toBe("https://whatson.bfi.org.uk/lff/Online/article/florid-lff26");
  });
});

describe("ICAScraper — cinema screens only", () => {
  it("drops performances on the Stage (talks and gigs share the markup)", async () => {
    // /live/gilla-band and /talks/my-tragedy carry .performance rows at "Stage".
    const screenings = await parse(fixturePage({ title: "In the Round: Gilla Band (SOLD OUT)", venue: "Stage" }));
    expect(screenings).toHaveLength(0);
  });

  it("keeps Cinema 2 screenings filed under Live or Exhibitions", async () => {
    // TG50 Heathen Earth and Artist's Film Picks both play in Cinema 2.
    const screenings = await parse(fixturePage({ title: "Throbbing Gristle – Heathen Earth Screening", venue: "Cinema 2" }));
    expect(screenings).toHaveLength(1);
    expect(screenings[0].screen).toBe("Cinema 2");
  });

  it("drops a performance with no venue", async () => {
    const screenings = await parse(fixturePage({ venue: "" }));
    expect(screenings).toHaveLength(0);
  });
});

describe("ICAScraper — initialize", () => {
  it("loads the festival cache before any page is fetched", async () => {
    const preload = vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
    const scraper = new ICAScraper() as unknown as { initialize: () => Promise<void> };
    await scraper.initialize();
    expect(preload).toHaveBeenCalledTimes(1);
  });
});

/**
 * Discovery (fetchPages). Modelled on the live site of 2026-10-04: /films
 * tiles of several types, the /upcoming calendar, and season/festival hubs
 * whose screenings live only on child pages. Before this, the scraper read
 * only `.item.films` tiles and never followed hub links, which cost 18 L-CUT
 * listings and ~110 screenings in total.
 */
describe("ICAScraper — page discovery", () => {
  const BASE = "https://www.ica.art";
  const tile = (type: string, href: string) => `<div class="item ${type} "><a href="${href}">x</a></div>`;
  const calendarItem = (type: string, href: string) =>
    `<div class="item ${type} "><div class="subhead sans ${type}"><a href="/${type}">${type}</a></div><a href="${href}">x</a></div>`;
  const hub = (side: string) =>
    `<html><body><div id="docket"><div id="detail-body"><a href="/films">Films</a></div>` +
    `<div id="detail-side">${side}</div></div></body></html>`;

  function siteScraper(site: Record<string, string>, onFetch?: () => void) {
    const scraper = new ICAScraper();
    const fetched: string[] = [];
    const internals = scraper as unknown as {
      fetchUrl: (url: string) => Promise<string>;
      delay: (ms: number) => Promise<void>;
      fetchPages: () => Promise<string[]>;
    };
    internals.fetchUrl = async (url: string) => {
      fetched.push(url);
      onFetch?.();
      if (!(url in site)) throw new Error(`HTTP 404: Not Found (${url})`);
      return site[url];
    };
    internals.delay = async () => {};
    return { fetchPages: () => internals.fetchPages(), fetched };
  }
  const warnings = () =>
    (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fetches every film-programme page reachable from /films, /upcoming and one hub level", async () => {
    const event = fixturePage();
    const site: Record<string, string> = {
      [`${BASE}/films`]:
        tile("films", "/films/cotton-queen") +
        tile("live", "/live/tg50-heathen-earth") +
        tile("exhibitions", "/exhibitions/artists-film-picks-no-other-choice") +
        tile("films", "/films/imamura") +
        tile("films", "/films/off-circuit") +
        tile("films", "/films/2024"),
      [`${BASE}/upcoming`]:
        calendarItem("films", "/films/lff-lali") +
        calendarItem("films", "/films/cotton-queen") +
        calendarItem("talks", "/talks/book-launch"),
      [`${BASE}/films/imamura`]: hub(
        `<a href="https://www.ica.art/imamura-stolen-desire"><img></a>` +
          `<a href="https://www.ica.art/imamura-stolen-desire">Stolen Desire</a>` +
          `<a href="https://www.ica.art/films/long-takes">Long Takes</a>` +
          `<a href="https://www.ica.art/films/bfi-london-film-festival-2026/lff-lali">Lali</a>` +
          `<a href="/book/765601">Book</a>` +
          `<a href="https://www.ica.art/open-records-generator/edit/films/x">edit</a>` +
          `<a href="www.docnrollfestival.com">festival site</a>` +
          `<a href="/2026-10-28">28</a>` +
          `<a href="https://example.com/elsewhere">elsewhere</a>`
      ),
      [`${BASE}/films/off-circuit`]: hub(
        `<a href="https://ica.art/off-circuit-mirage">Mirage</a>` +
          `<details><summary><a href="https://ica.art/dry-leaf">Dry Leaf</a></summary></details>`
      ),
      [`${BASE}/films/long-takes`]: hub(`<a href="https://www.ica.art/angelopoulos">Angelopoulos</a>`),
      [`${BASE}/films/cotton-queen`]: event,
      [`${BASE}/live/tg50-heathen-earth`]: event,
      [`${BASE}/exhibitions/artists-film-picks-no-other-choice`]: event,
      [`${BASE}/films/lff-lali`]: event,
      [`${BASE}/imamura-stolen-desire`]: event,
      [`${BASE}/off-circuit-mirage`]: event,
    };
    const { fetchPages, fetched } = siteScraper(site);

    const pages = await fetchPages();

    expect(fetched).toEqual([
      `${BASE}/films`,
      `${BASE}/upcoming`,
      `${BASE}/films/cotton-queen`,
      `${BASE}/live/tg50-heathen-earth`,
      `${BASE}/exhibitions/artists-film-picks-no-other-choice`,
      `${BASE}/films/imamura`,
      `${BASE}/films/off-circuit`,
      `${BASE}/films/lff-lali`,
      `${BASE}/imamura-stolen-desire`,
      `${BASE}/films/long-takes`,
      `${BASE}/off-circuit-mirage`,
    ]);
    // Only pages with a performance list are handed to the parser.
    expect(pages).toHaveLength(6);
  });

  it("stops at the page budget and keeps what it already fetched", async () => {
    const children = Array.from({ length: 300 }, (_, i) => `<a href="/films/child-${i}">c</a>`).join("");
    const site: Record<string, string> = {
      [`${BASE}/films`]: tile("films", "/films/big-hub"),
      [`${BASE}/upcoming`]: "",
      [`${BASE}/films/big-hub`]: hub(children),
    };
    for (let i = 0; i < 300; i++) site[`${BASE}/films/child-${i}`] = fixturePage();
    const { fetchPages, fetched } = siteScraper(site);

    const pages = await fetchPages();

    // 2 index pages + 170 budgeted page fetches (the hub plus 169 children).
    expect(fetched).toHaveLength(172);
    expect(pages).toHaveLength(169);
    expect(warnings().some((w) => w.includes("page budget (170)") && w.includes("131 queued page(s) not fetched"))).toBe(true);
  });

  it("stops queuing fetches once the time budget is spent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
      const children = Array.from({ length: 100 }, (_, i) => `<a href="/films/child-${i}">c</a>`).join("");
      const site: Record<string, string> = {
        [`${BASE}/films`]: tile("films", "/films/big-hub"),
        [`${BASE}/upcoming`]: "",
        [`${BASE}/films/big-hub`]: hub(children),
      };
      for (let i = 0; i < 100; i++) site[`${BASE}/films/child-${i}`] = fixturePage();
      const { fetchPages, fetched } = siteScraper(site, () => vi.setSystemTime(Date.now() + 10_000));

      const pages = await fetchPages();

      // Each fetch costs 10s; the 300s budget is spent after 30 fetches
      // (2 index pages, the hub and 27 children).
      expect(fetched).toHaveLength(30);
      expect(pages).toHaveLength(27);
      expect(warnings().some((w) => w.includes("time budget (300s)") && w.includes("/films/child-27"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when /films fails instead of returning a partial programme", async () => {
    const { fetchPages } = siteScraper({ [`${BASE}/upcoming`]: calendarItem("films", "/films/lff-lali") });
    await expect(fetchPages()).rejects.toThrow(/films/);
  });

  it("carries on without /upcoming when the calendar fails", async () => {
    const { fetchPages, fetched } = siteScraper({
      [`${BASE}/films`]: tile("films", "/films/cotton-queen"),
      [`${BASE}/films/cotton-queen`]: fixturePage(),
    });

    const pages = await fetchPages();

    expect(fetched).toEqual([`${BASE}/films`, `${BASE}/upcoming`, `${BASE}/films/cotton-queen`]);
    expect(pages).toHaveLength(1);
    expect(warnings().some((w) => w.includes("/upcoming failed"))).toBe(true);
  });

  it("summarises failed page fetches in one warning", async () => {
    const { fetchPages } = siteScraper({
      [`${BASE}/films`]: tile("films", "/films/gone") + tile("films", "/films/imamura"),
      [`${BASE}/upcoming`]: "",
      [`${BASE}/films/imamura`]: hub(
        `<a href="/imamura-stolen-desire">a</a><a href="/imamura-missing-1">b</a><a href="/imamura-missing-2">c</a>`
      ),
      [`${BASE}/imamura-stolen-desire`]: fixturePage(),
    });

    const pages = await fetchPages();

    expect(pages).toHaveLength(1);
    const summaries = warnings().filter((w) => w.includes("page fetch(es) failed"));
    expect(summaries).toEqual([
      "[ica] 3 page fetch(es) failed (1 from /films or /upcoming, 2 hub children); this run's programme is incomplete",
    ]);
  });
});
