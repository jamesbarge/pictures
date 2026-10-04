import { describe, expect, it, vi } from "vitest";
import {
  IbraazScraper,
  isScreeningEvent,
  parseIbraazDateTimes,
  parseListingCards,
} from "./ibraaz";
import { getScraperByTaskId } from "../registry";
import { getCinemaById } from "@/config/cinema-registry";

/**
 * Fixtures are minimal slices of ibraaz.org markup captured 2026-10-04 (Nuxt
 * SSR, Craft CMS + Solspace Calendar). Only the elements the parser reads are
 * kept: `article.card` tags/links on /whats-on, and the hero tags, h1,
 * "Date and Time" summary, canonical, og:image and Ticket Tailor widget on a
 * detail page.
 */

const card = (slug: string, tags: string[], title: string) => `
<li class="gallery__item"><article class="card"><a href="/whats-on/${slug}" class="card__media landscape"><img alt="Read &#39;${title}&#39;" src="https://ibraaz-website.imgix.net/1/x.jpg?w=10&amp;h=10"></a><div class="card__row"><ul class="card__info list-h"><!----><!--[-->${tags
  .map(
    (t) =>
      `<li><a href="/whats-on?category=${t.toLowerCase()}" class="router-link-active"><div class="tag tag--themed"><!--[-->${t}<!--]--></div></a></li>`,
  )
  .join("")}<!--]--></ul><a href="/whats-on/${slug}" class=""><time datetime="2026-10-18T15:00:00+00:00" class="card__dates"><!--[-->18 Oct<!--]--></time></a></div><a href="/whats-on/${slug}" class="card__title"><h3><span class="title">${title}</span></h3><p class="line">Someone</p></a><!----></article></li>`;

const LISTING_FIXTURE = `<!doctype html><html><body><main>
<nav><a href="/whats-on/cosmic-breath-joe-namy"><div class="tag">Exhibition</div>Cosmic Breath</a></nav>
<ul class="gallery">
${card("taring-padi", ["Exhibition"], "Rakyat Pasti Menang")}
${card("a-lifework-of-mourning", ["Talk"], "A Lifework of Mourning")}
${card("foragers", ["Film"], "Foragers")}
${card("milisuthando", ["Film"], "MILISUTHANDO")}
${card("yugantar", ["Film"], "Yugantar")}
${card("performance-lecture-the-glass-essays", ["Film", "Performance"], "The Glass Essays: Performance Lecture")}
${card("ça-twiste-à-popenguine", ["Film"], "Ça Twiste à Popenguine")}
</ul>
<ul class="slice__body">${card("foragers", ["Film"], "Foragers")}</ul>
</main></body></html>`;

interface DetailOptions {
  slug?: string;
  canonicalSlug?: string | null;
  title?: string;
  tags?: string[];
  datesHtml?: string | null;
  ticketHref?: string | null;
}

function detailPage({
  slug = "foragers",
  canonicalSlug,
  title = "Foragers",
  tags = ["Film"],
  datesHtml = "<p>Sun 18 Oct, 3–4.30pm</p>",
  ticketHref = "https://tickets.ibraaz.org/events/ibraaz/2438682/select-date?ref=website_widget",
}: DetailOptions = {}): string {
  const canonical = canonicalSlug === undefined ? slug : canonicalSlug;
  return `<!doctype html><html><head>
${canonical === null ? "" : `<link rel="canonical" href="https://ibraaz.org/whats-on/${canonical}">`}
<meta property="og:image" content="https://ibraaz-website.imgix.net/30698/foragers.jpg?h=1200&w=630&q=70&fm=webp">
</head><body><main class="theme-base root__body">
<div class="hero themed"><div class="hero__inner stack-deep"><div class="stack"><ul class="list-h hero__tags"><!--[-->${tags
    .map((t) => `<li><div class="tag"><!--[-->${t}<!--]--></div></li>`)
    .join("")}<!--]--></ul><h1 class="headline headline--lg">${title}</h1></div><p class="line line--lg">Jumana Manna</p></div></div>
<div class="split"><div class="split__head"><div class="split__details"><!--[--><dl class="summary">${
    datesHtml === null
      ? ""
      : `<div class="summary__item"><dt class="visually-hidden">Date and Time:</dt><dd class="desc"><div>${datesHtml}</div></dd></div>`
  }<div class="summary__item summary__item--separated"><dt class="desc">Location:</dt><dd class="desc">Majlis</dd></div></dl><!--]--></div></div>
<div class="split__body"><p>Doors open at 2.30pm; event starts at 3pm and ends at 4.30pm.</p></div>
<div class="target"><div class="tt-widget"><div class="tt-widget-fallback stack">${
    ticketHref === null
      ? ""
      : `<a href="${ticketHref}" rel="noopener noreferrer" target="_blank" class="title"> Click here to buy tickets </a>`
  }<a href="https://www.tickettailor.com?rf=wdg_265722" rel="noopener noreferrer" target="_blank" class="tt-widget-powered"> Sell tickets online with Ticket Tailor </a></div></div></div></div>
<div class="slice"><ul class="slice__body"><li><article class="card"><time datetime="2026-12-06T15:00:00+00:00" class="card__dates">6 Dec</time></article></li></ul></div>
</main></body></html>`;
}

// Mid-way through the 2026-10-04 audit window: before every fixture date.
const REF_2026_10_04 = new Date("2026-10-04T12:00:00Z");

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe("parseIbraazDateTimes", () => {
  it.each([
    // Live pages, 2026-10-04. Foragers is BST, MILISUTHANDO is the 25 Oct
    // changeover Sunday (clocks went back at 01:00 UTC, so 3pm is GMT).
    ["Sun 18 Oct, 3–4.30pm", REF_2026_10_04, ["2026-10-18T14:00:00.000Z"]],
    ["Sun 25 Oct, 3–5.30pm", REF_2026_10_04, ["2026-10-25T15:00:00.000Z"]],
    ["Sun 15 Nov, 3–4.30pm", REF_2026_10_04, ["2026-11-15T15:00:00.000Z"]],
    // Archive spellings: full weekday, full month, hyphen, em dash, colon
    // minutes, spaces around the dash and before the meridiem.
    ["Sunday 7 June, 3–4.30pm", new Date("2026-06-01T12:00:00Z"), ["2026-06-07T14:00:00.000Z"]],
    ["Wednesday 3 Dec, 6.30-8pm", new Date("2025-11-20T12:00:00Z"), ["2025-12-03T18:30:00.000Z"]],
    ["Sunday 19 Jul, 3—4:30 pm", new Date("2026-07-01T12:00:00Z"), ["2026-07-19T14:00:00.000Z"]],
    ["Sunday 15 Feb, 2 – 3.30 pm", new Date("2026-02-01T12:00:00Z"), ["2026-02-15T14:00:00.000Z"]],
    ["Sunday 14 June, 3–4 pm", new Date("2026-06-01T12:00:00Z"), ["2026-06-14T14:00:00.000Z"]],
    ["Sunday 12 Apr, 1–2.45pm", new Date("2026-04-01T12:00:00Z"), ["2026-04-12T12:00:00.000Z"]],
  ])("%s", (text, ref, expected) => {
    expect(iso(parseIbraazDateTimes(text, ref))).toEqual(expected);
  });

  it("takes the start's meridiem from the end time unless that would put the start after the end", () => {
    const ref = new Date("2026-11-01T12:00:00Z");
    expect(iso(parseIbraazDateTimes("Sat 7 Nov, 11–1pm", ref))).toEqual(["2026-11-07T11:00:00.000Z"]);
    expect(iso(parseIbraazDateTimes("Sat 7 Nov, 11.30–12.30pm", ref))).toEqual(["2026-11-07T11:30:00.000Z"]);
    expect(iso(parseIbraazDateTimes("Sat 7 Nov, 12–2pm", ref))).toEqual(["2026-11-07T12:00:00.000Z"]);
  });

  it("reads an explicit start meridiem and single start times", () => {
    const ref = new Date("2026-11-01T12:00:00Z");
    expect(iso(parseIbraazDateTimes("Sat 7 Nov, 11am–1pm", ref))).toEqual(["2026-11-07T11:00:00.000Z"]);
    expect(iso(parseIbraazDateTimes("Sat 7 Nov, 7.30pm", ref))).toEqual(["2026-11-07T19:30:00.000Z"]);
    expect(iso(parseIbraazDateTimes("Sat 7 Nov, 18:30", ref))).toEqual(["2026-11-07T18:30:00.000Z"]);
  });

  it("returns one start per time range when a day lists several", () => {
    expect(
      iso(parseIbraazDateTimes("Saturday 27 June, 1–3pm and 7–8pm", new Date("2026-06-01T12:00:00Z"))),
    ).toEqual(["2026-06-27T12:00:00.000Z", "2026-06-27T18:00:00.000Z"]);
  });

  it("honours an explicit year instead of inferring one", () => {
    expect(
      iso(parseIbraazDateTimes("Wednesday 21 Jan 2026, 6-8pm", new Date("2025-12-20T12:00:00Z"))),
    ).toEqual(["2026-01-21T18:00:00.000Z"]);
  });

  it("rolls a yearless date that has already passed into next year (shared parser convention)", () => {
    expect(
      iso(parseIbraazDateTimes("Sun 3 Jan, 3–5pm", new Date("2026-12-20T12:00:00Z"))),
    ).toEqual(["2027-01-03T15:00:00.000Z"]);
  });

  it("keeps today's screening on today's date", () => {
    expect(
      iso(parseIbraazDateTimes("Sun 18 Oct, 3–4.30pm", new Date("2026-10-18T13:00:00Z"))),
    ).toEqual(["2026-10-18T14:00:00.000Z"]);
  });

  it("rejects a weekday that disagrees with the inferred date rather than guessing the year", () => {
    // 18 Oct 2026 is a Sunday. A stale past listing rolled into next year
    // lands on a different weekday, which is exactly what this guards.
    expect(parseIbraazDateTimes("Mon 18 Oct, 3–4.30pm", REF_2026_10_04)).toEqual([]);
    expect(parseIbraazDateTimes("Sun 4 Oct, 3pm", new Date("2026-10-05T12:00:00Z"))).toEqual([]);
  });

  it("returns nothing for shapes it does not understand", () => {
    expect(parseIbraazDateTimes("Dates to be announced", REF_2026_10_04)).toEqual([]);
    expect(parseIbraazDateTimes("Sat 7 & Sun 8 Nov, 3pm", REF_2026_10_04)).toEqual([]);
    expect(parseIbraazDateTimes("Sun 18 Oct", REF_2026_10_04)).toEqual([]);
    expect(parseIbraazDateTimes("Sun 18 Oct, late afternoon", REF_2026_10_04)).toEqual([]);
  });
});

describe("isScreeningEvent", () => {
  it.each([
    [["Film"], true],
    // Library Transmission evenings are screenings with an introduction.
    [["Film", "Library-in-Residence"], true],
    // The Last Responders: a 50-minute documentary followed by a conversation.
    [["Talk", "Film"], true],
    // The Glass Essays performance lecture, Rihla (lecture with excerpts) and
    // a cassette-archive day are live events that include film.
    [["Film", "Performance"], false],
    [["Film", "Workshop"], false],
    [["Film", "Music"], false],
    // A co-tag we have never seen is treated as non-film until reviewed.
    [["Film", "Exhibition"], false],
    [["Talk"], false],
    [["Exhibition"], false],
    [[], false],
  ])("%j -> %s", (tags, expected) => {
    expect(isScreeningEvent(tags)).toBe(expected);
  });
});

describe("parseListingCards", () => {
  it("returns each article card once with its slug and tags", () => {
    const cards = parseListingCards(LISTING_FIXTURE);
    expect(cards).toEqual([
      { slug: "taring-padi", tags: ["Exhibition"] },
      { slug: "a-lifework-of-mourning", tags: ["Talk"] },
      { slug: "foragers", tags: ["Film"] },
      { slug: "milisuthando", tags: ["Film"] },
      { slug: "yugantar", tags: ["Film"] },
      { slug: "performance-lecture-the-glass-essays", tags: ["Film", "Performance"] },
      { slug: "ça-twiste-à-popenguine", tags: ["Film"] },
    ]);
  });

  it("selects the film screenings from the 2026-10-04 listing", () => {
    const slugs = parseListingCards(LISTING_FIXTURE)
      .filter((c) => isScreeningEvent(c.tags))
      .map((c) => c.slug);
    expect(slugs).toEqual(["foragers", "milisuthando", "yugantar", "ça-twiste-à-popenguine"]);
  });
});

describe("IbraazScraper.parseEventPage", () => {
  const scraper = new IbraazScraper();

  it("builds one screening from the detail page", () => {
    expect(scraper.parseEventPage(detailPage(), REF_2026_10_04)).toEqual([
      {
        filmTitle: "Foragers",
        datetime: new Date("2026-10-18T14:00:00.000Z"),
        bookingUrl: "https://tickets.ibraaz.org/events/ibraaz/2438682/select-date?ref=website_widget",
        sourceId: "ibraaz-foragers-2026-10-18T14:00:00.000Z",
        posterUrl: "https://ibraaz-website.imgix.net/30698/foragers.jpg?h=1200&w=630&q=70&fm=webp",
      },
    ]);
  });

  it("parses the GMT side of the clock change on 25 Oct", () => {
    const [s] = scraper.parseEventPage(
      detailPage({ slug: "milisuthando", title: "MILISUTHANDO", datesHtml: "<p>Sun 25 Oct, 3–5.30pm</p>" }),
      REF_2026_10_04,
    );
    expect(s.datetime.toISOString()).toBe("2026-10-25T15:00:00.000Z");
    expect(s.sourceId).toBe("ibraaz-milisuthando-2026-10-25T15:00:00.000Z");
  });

  it("decodes a percent-encoded canonical slug so sourceIds match the listing slug", () => {
    const [s] = scraper.parseEventPage(
      detailPage({
        canonicalSlug: "%c3%a7a-twiste-%c3%a0-popenguine",
        title: "Ça Twiste à Popenguine",
        datesHtml: "<p>Sun 1 Nov, 3–4.30pm</p>",
      }),
      REF_2026_10_04,
    );
    expect(s.sourceId).toBe("ibraaz-ça-twiste-à-popenguine-2026-11-01T15:00:00.000Z");
  });

  it("keeps a malformed percent-encoded slug as-is instead of failing the page", () => {
    const [s] = scraper.parseEventPage(detailPage({ canonicalSlug: "foragers%E0%A4" }), REF_2026_10_04);
    expect(s.sourceId).toBe("ibraaz-foragers%E0%A4-2026-10-18T14:00:00.000Z");
  });

  it("falls back to a title slug when the page has no canonical link", () => {
    const [s] = scraper.parseEventPage(detailPage({ canonicalSlug: null }), REF_2026_10_04);
    expect(s.sourceId).toBe("ibraaz-foragers-2026-10-18T14:00:00.000Z");
  });

  it("emits one row per <p> in the date summary", () => {
    const rows = scraper.parseEventPage(
      detailPage({ datesHtml: "<p>Sat 7 Nov, 3–4.30pm</p><p>Sun 8 Nov, 6–7.30pm</p>" }),
      REF_2026_10_04,
    );
    expect(rows.map((r) => r.datetime.toISOString())).toEqual([
      "2026-11-07T15:00:00.000Z",
      "2026-11-08T18:00:00.000Z",
    ]);
  });

  it("links the event page when there is no Ticket Tailor link, never the 'powered by' link", () => {
    const [s] = scraper.parseEventPage(detailPage({ ticketHref: null }), REF_2026_10_04);
    expect(s.bookingUrl).toBe("https://ibraaz.org/whats-on/foragers");
  });

  it("accepts a Ticket Tailor link on tickettailor.com", () => {
    const href = "https://www.tickettailor.com/events/ibraaz/2438682";
    const [s] = scraper.parseEventPage(detailPage({ ticketHref: href }), REF_2026_10_04);
    expect(s.bookingUrl).toBe(href);
  });

  it("returns nothing when the date summary is missing or unreadable", () => {
    expect(scraper.parseEventPage(detailPage({ datesHtml: null }), REF_2026_10_04)).toEqual([]);
    expect(
      scraper.parseEventPage(detailPage({ datesHtml: "<p>Dates to be announced</p>" }), REF_2026_10_04),
    ).toEqual([]);
  });
});

describe("IbraazScraper.fetchPages", () => {
  function stubbed(fetchUrl: (url: string) => Promise<string>) {
    const internals = new IbraazScraper() as unknown as {
      fetchPages: () => Promise<string[]>;
      fetchUrl: (url: string) => Promise<string>;
    };
    const spy = vi.spyOn(internals, "fetchUrl").mockImplementation(fetchUrl);
    return { internals, spy };
  }

  it("fetches the listing, then only the screening pages, URL-encoded", async () => {
    const { internals, spy } = stubbed(async (url) =>
      url === "https://ibraaz.org/whats-on" ? LISTING_FIXTURE : detailPage(),
    );
    await expect(internals.fetchPages()).resolves.toHaveLength(4);
    expect(spy.mock.calls.map(([url]) => url)).toEqual([
      "https://ibraaz.org/whats-on",
      "https://ibraaz.org/whats-on/foragers",
      "https://ibraaz.org/whats-on/milisuthando",
      "https://ibraaz.org/whats-on/yugantar",
      "https://ibraaz.org/whats-on/%C3%A7a-twiste-%C3%A0-popenguine",
    ]);
  });

  it("fails loudly when the listing has no event cards, since Ibraaz always lists exhibitions", async () => {
    const { internals } = stubbed(async () => "<html><body><main></main></body></html>");
    await expect(internals.fetchPages()).rejects.toThrow(/no event cards/);
  });

  it("fails the scrape when an event page fails, so the runner retries the venue", async () => {
    const { internals } = stubbed(async (url) => {
      if (url.endsWith("/milisuthando")) throw new Error("HTTP 500: Internal Server Error");
      return url === "https://ibraaz.org/whats-on" ? LISTING_FIXTURE : detailPage();
    });
    await expect(internals.fetchPages()).rejects.toThrow(/HTTP 500/);
  });
});

describe("Ibraaz registry wiring", () => {
  it("runs as a first-party Cheerio scraper, no longer an L-CUT source-only venue", () => {
    const entry = getScraperByTaskId("scraper-ibraaz");
    expect(entry?.wave).toBe("cheerio");
    const config = entry!.buildConfig();
    if (config.type !== "single") throw new Error("expected a single-venue config");
    expect(config.venue.id).toBe("ibraaz");
    expect(config.createScraper()).toBeInstanceOf(IbraazScraper);

    const cinema = getCinemaById("ibraaz");
    expect(cinema?.scraperType).toBe("cheerio");
    expect(cinema?.scraperModule).toBe("cinemas/ibraaz");
    expect(cinema?.scraperFactory).toBe("createIbraazScraper");
  });
});
