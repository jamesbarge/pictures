/**
 * One-time cleanup script for films missing TMDB data with screenings through Feb 2026.
 *
 * Classifies 166 entries into:
 *   - delete: Not a film (events, talks, quizzes, concerts, etc.)
 *   - clean:  Real film with dirty title — provide cleaned title + optional year
 *   - match:  Real film, clean title — retry TMDB with year override + skipAmbiguityCheck
 *   - skip:   Too obscure / ambiguous for TMDB — leave as-is
 *
 * Usage:
 *   npm run cleanup:feb-films -- --dry-run   # preview only
 *   npm run cleanup:feb-films                # execute
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, gte, and } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient } from "@/lib/tmdb";

const DRY_RUN = process.argv.includes("--dry-run");
const RATE_LIMIT_MS = 300;

// ---------------------------------------------------------------------------
// HTML entity / mojibake decoding (copied from enrich-upcoming-films.ts)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(text: string): string {
  let decoded = text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

  if (/&[A-Za-z]+;/.test(decoded)) {
    const entityMap: Record<string, number> = {
      "&Atilde;": 0xC3, "&Acirc;": 0xC2, "&Aring;": 0xC5,
      "&AElig;": 0xC6, "&Ccedil;": 0xC7, "&Egrave;": 0xC8,
      "&Eacute;": 0xC9, "&Euml;": 0xCB, "&Iacute;": 0xCD,
      "&Icirc;": 0xCE, "&Ntilde;": 0xD1, "&Ograve;": 0xD2,
      "&Oacute;": 0xD3, "&Ouml;": 0xD6, "&Uacute;": 0xDA,
      "&Uuml;": 0xDC,
      "&iexcl;": 0xA1, "&cent;": 0xA2, "&pound;": 0xA3,
      "&curren;": 0xA4, "&yen;": 0xA5, "&brvbar;": 0xA6,
      "&sect;": 0xA7, "&uml;": 0xA8, "&copy;": 0xA9,
      "&ordf;": 0xAA, "&laquo;": 0xAB, "&not;": 0xAC,
      "&shy;": 0xAD, "&reg;": 0xAE, "&macr;": 0xAF,
      "&deg;": 0xB0, "&plusmn;": 0xB1, "&sup2;": 0xB2,
      "&sup3;": 0xB3, "&acute;": 0xB4, "&micro;": 0xB5,
      "&para;": 0xB6, "&middot;": 0xB7, "&cedil;": 0xB8,
      "&sup1;": 0xB9, "&ordm;": 0xBA, "&raquo;": 0xBB,
      "&frac14;": 0xBC, "&frac12;": 0xBD, "&frac34;": 0xBE,
      "&iquest;": 0xBF,
    };

    const entityPattern = /&[A-Za-z]+;/g;
    const bytes: number[] = [];
    let lastIndex = 0;
    let result = "";
    let match: RegExpExecArray | null;

    while ((match = entityPattern.exec(decoded)) !== null) {
      const entity = match[0];
      const byteVal = entityMap[entity];

      if (byteVal !== undefined) {
        if (match.index > lastIndex) {
          if (bytes.length > 0) {
            result += new TextDecoder().decode(new Uint8Array(bytes));
            bytes.length = 0;
          }
          result += decoded.slice(lastIndex, match.index);
        }
        bytes.push(byteVal);
        lastIndex = match.index + entity.length;
      } else {
        if (bytes.length > 0) {
          result += new TextDecoder().decode(new Uint8Array(bytes));
          bytes.length = 0;
        }
        if (match.index > lastIndex) {
          result += decoded.slice(lastIndex, match.index);
        }
        result += entity;
        lastIndex = match.index + entity.length;
      }
    }

    if (bytes.length > 0) {
      result += new TextDecoder().decode(new Uint8Array(bytes));
    }
    if (lastIndex < decoded.length) {
      result += decoded.slice(lastIndex);
    }

    if (result) {
      decoded = result;
    }
  }

  return decoded;
}

// ---------------------------------------------------------------------------
// Classification map — one entry per film title
// ---------------------------------------------------------------------------

type FilmAction =
  | { action: "delete" }
  | { action: "clean"; cleanedTitle: string; year?: number }
  | { action: "match"; year?: number }
  | { action: "skip" };

/**
 * Lookup by film title as it appears in the database.
 * Titles are matched after HTML entity decoding.
 */
const FILM_MAP: Record<string, FilmAction> = {
  // ─── DELETE: Not a film ───────────────────────────────────────────────
  "100 Bible Films (2026)": { action: "delete" },
  "25 and Under: An Introduction to Constructed, Told, Spoken (2026)": { action: "delete" },
  "An Evening with Philip Reeve Celebrating 25 Years of Mortal Engines": { action: "delete" },
  "An Introduction to Andrzej Wajda (2026)": { action: "delete" },
  "Arts and Multiculturalism (2026)": { action: "delete" },
  "Black History Studies: Afeni Shakur... + Liberty Double Bill": { action: "delete" },
  "Black Queer Lives in the Archive (2026)": { action: "delete" },
  "Blues at the Ritzy": { action: "delete" },
  "Club Room Comedy: Ali Woods, Farhan Solo, Sikisa, and Roman Harris": { action: "delete" },
  "Collage making workshop": { action: "delete" },
  "D'Angelo 'Live In Stockholm'": { action: "delete" },
  "Daniel Farson (2026)": { action: "delete" },
  "DocHouse: BAFTA-nominated Shorts (2026)": { action: "delete" },
  "Doctor Who Special Edition: Warriors of the Deep (2026)": { action: "delete" },
  "Elvis Presley in Concert": { action: "delete" },
  "Film Exposure Night": { action: "delete" },
  "Fractured Horizons": { action: "delete" },
  "Fractured Horizons: Three stories of migration...": { action: "delete" },
  "From Lumi\u00e8re to Lloyd: Silent Cinema with Live Organ and Paul Merton": { action: "delete" },
  "Genesis Writers Group": { action: "delete" },
  "Hannah Horton & Sam Leak Duo": { action: "delete" },
  "Home Truths: Shorts exploring relationships... I'm Migrant Film Festival": { action: "delete" },
  "HONK! ADULT MAGAZINE PRESENTS: A NIGHT AT THE PEEP SHOW!": { action: "delete" },
  "How to Get to Heaven from Belfast (2026)": { action: "delete" },
  "I'm Migrant": { action: "delete" },
  "In conversation with Bouchra Khalili": { action: "delete" },
  "Industry Panel: Intimacy Coordination": { action: "delete" },
  "Intimacy Coordination": { action: "delete" },
  "James Blake": { action: "delete" },
  "Liberation Struggles (2026)": { action: "delete" },
  "Max Richter Scientist of The Soul: Hamnet": { action: "delete" },
  "Members' sake & cheese tasting (2026)": { action: "delete" },
  "Mini Filmmakers Club (2026)": { action: "delete" },
  "Multicultural TV on ITV (2026)": { action: "delete" },
  "Multicultural TV on the BBC (2026)": { action: "delete" },
  "National Theatre Live: The Audience (Re-release) (2026)": { action: "delete" },
  "Neurospicy": { action: "delete" },
  "Peaking \u2013 Euphoric Psychedelia in our Digital Imaginations": { action: "delete" },
  "Pitchblack Playback: D'Angelo 'Live In Stockholm'": { action: "delete" },
  "Pitchblack Playback: James Blake 'James Blake'...": { action: "delete" },
  "Prince Charles Cinema Film Quiz": { action: "delete" },
  "Reading group Natacha Appanah": { action: "delete" },
  "Reflecting on Stuart Hall's Impact (2026)": { action: "delete" },
  "Representation of Women on Multicultural TV (2026)": { action: "delete" },
  "RuPaul's Drag Race: UK vs. the World Series 3": { action: "delete" },
  "SCREEN IN USE - 30": { action: "delete" },
  "Short films by Isiah Medina (2014)": { action: "delete" },
  "Small World Cinema": { action: "delete" },
  "Some Like it Swing": { action: "delete" },
  "Soul at The Ritzy": { action: "delete" },
  "Story Time 5-7yo 28/02/2026": { action: "delete" },
  "The Big Ritzy Quiz": { action: "delete" },
  "The Class Division in the Film Industry": { action: "delete" },
  "The Liberated Film Club: Daniel Blumberg": { action: "delete" },
  "The Liberated Film Club: Mih\u00e1ly V\u00edg": { action: "delete" },
  "The London International Animation Festival presents...": { action: "delete" },
  "The Quiz of Rassilon (2026)": { action: "delete" },
  "TV PARTY, TONIGHT!: An Education in Blood and Guts Filmmaking": { action: "delete" },
  "TV PARTY, TONIGHT!: Anarchism and Misrule in Cinema": { action: "delete" },
  "TV PARTY, TONIGHT!: Photographers on Film": { action: "delete" },
  "Uneasy Balance - Two stories of Lebanese Identity...": { action: "delete" },
  "Young Filmmakers Club (2026)": { action: "delete" },

  // ─── CLEAN: Real films with dirty titles ──────────────────────────────
  "\"Wuthering Heights\" + Charli XCX Dance Party": { action: "clean", cleanedTitle: "Wuthering Heights", year: 2011 },
  "A Kind Of Loving: John Schlesinger Season": { action: "clean", cleanedTitle: "A Kind of Loving", year: 1962 },
  "Adabana + Director Q&A": { action: "clean", cleanedTitle: "Adabana" },
  "Black Girl + Jemima + Johnny (2026)": { action: "clean", cleanedTitle: "Black Girl", year: 1966 },
  "CAFE FLESH (1982)": { action: "clean", cleanedTitle: "Cafe Flesh", year: 1982 },
  "Christine (1983)": { action: "clean", cleanedTitle: "Christine", year: 1983 },
  "Christine & Killer Sofa (1983)": { action: "clean", cleanedTitle: "Christine", year: 1983 },
  "Collective Monologue + director conversation (2026)": { action: "clean", cleanedTitle: "Collective Monologue" },
  "Dog Friendly Screening: Marty Supreme": { action: "clean", cleanedTitle: "Marty Supreme" },
  "Drink & Dine: Call Me by Your Name": { action: "clean", cleanedTitle: "Call Me by Your Name", year: 2017 },
  "DRINK & DINE: Grease Sing-Along!": { action: "clean", cleanedTitle: "Grease", year: 1978 },
  "Drink & Dine: It's Never Over, Jeff Buckley + Grace Listening Party": { action: "clean", cleanedTitle: "It's Never Over, Jeff Buckley" },
  "Drink & Dine: Licorice Pizza + Pizza Night": { action: "clean", cleanedTitle: "Licorice Pizza", year: 2021 },
  "Drink & Dine: Sinners": { action: "clean", cleanedTitle: "Sinners" },
  "DRINK & DINE: The Greatest Showman Sing-A-Long": { action: "clean", cleanedTitle: "The Greatest Showman", year: 2017 },
  "Family Funday Preview: Stitch Head (2026)": { action: "clean", cleanedTitle: "Stitch Head" },
  "ICI London And CinemaItaliaUK Special Screening of The Forbidden City": { action: "clean", cleanedTitle: "The Forbidden City" },
  "Kids Club: The Princess and the Frog (2026)": { action: "clean", cleanedTitle: "The Princess and the Frog", year: 2009 },
  "La Belle et la Bete + pre-recorded intro (2026)": { action: "clean", cleanedTitle: "La Belle et la B\u00eate", year: 1946 },
  "Lexi Seniors' Film Club: Out of Africa": { action: "clean", cleanedTitle: "Out of Africa", year: 1985 },
  "LRB Screen/London Reviewed: Night and the City (1950)": { action: "clean", cleanedTitle: "Night and the City", year: 1950 },
  "MilkTea presents \u2013 UK Premiere: Last Days (2026)": { action: "clean", cleanedTitle: "Last Days" },
  "NAKED KILLER (ON VHS) (1992)": { action: "clean", cleanedTitle: "Naked Killer", year: 1992 },
  "NEVER WATCHING MOVIES: Spike Lee's SCHOOL DAZE (1988)": { action: "clean", cleanedTitle: "School Daze", year: 1988 },
  "of 4K Restoration: The Garden of Eden (2026)": { action: "clean", cleanedTitle: "The Garden of Eden" },
  "PERDITA DURANGO (1997)": { action: "clean", cleanedTitle: "Perdita Durango", year: 1997 },
  "Philadelphia (35mm)": { action: "clean", cleanedTitle: "Philadelphia", year: 1993 },
  "S\u00e1t\u00e1ntang\u00f3": { action: "clean", cleanedTitle: "S\u00e1t\u00e1ntang\u00f3", year: 1994 },
  "Seniors' Paid Matinee: My Father's Shadow (2026)": { action: "clean", cleanedTitle: "My Father's Shadow" },
  "Sing-A-Long-A Rocky Horror Picture Show": { action: "clean", cleanedTitle: "The Rocky Horror Picture Show", year: 1975 },
  "Strange Days (2026)": { action: "clean", cleanedTitle: "Strange Days", year: 1995 },
  "Sunday Bloody Sunday: John Schlesinger Season": { action: "clean", cleanedTitle: "Sunday Bloody Sunday", year: 1971 },
  "Tarot readings, Demi Moore-tins + Ghost": { action: "clean", cleanedTitle: "Ghost", year: 1990 },
  "Tarot readings, Demi Moore-tinis + Ghost": { action: "clean", cleanedTitle: "Ghost", year: 1990 },
  "The Lord of the Rings: The Fellowship of the Ring (25th Anniversary)...": { action: "clean", cleanedTitle: "The Lord of the Rings: The Fellowship of the Ring", year: 2001 },
  "The Loveless (2026)": { action: "clean", cleanedTitle: "The Loveless", year: 1981 },
  "The War Trilogy: A Generation (2026)": { action: "clean", cleanedTitle: "A Generation", year: 1955 },
  "The War Trilogy: Kanal + pre-recorded intro (2026)": { action: "clean", cleanedTitle: "Kanal", year: 1957 },
  "Toddler Club: Lady and the Tramp (1955)": { action: "clean", cleanedTitle: "Lady and the Tramp", year: 1955 },
  "UK PREMIERE Do You Love Me (2025)": { action: "clean", cleanedTitle: "Do You Love Me", year: 2025 },
  "UK PREMIERE Inventing the Future (2020)": { action: "clean", cleanedTitle: "Inventing the Future", year: 2020 },
  "Valentine's Throwback: Pretty Woman (1990)": { action: "clean", cleanedTitle: "Pretty Woman", year: 1990 },
  "Video Bazaar presents He Who Gets Slapped w/ Live Score (1924)": { action: "clean", cleanedTitle: "He Who Gets Slapped", year: 1924 },
  "Wuthering Heights + A Panel Discussion on the Future of Film Criticism": { action: "clean", cleanedTitle: "Wuthering Heights", year: 2011 },
  "Drink & Dine: The Moment": { action: "clean", cleanedTitle: "The Moment" },
  "Queer East presents Miracle on Jongno Street (2010)": { action: "clean", cleanedTitle: "Miracle on Jongno Street", year: 2010 },
  "S\u00dcRREAL S\u0130NEMA: VANILLA IS A TURKISH WORD": { action: "clean", cleanedTitle: "Vanilla Is a Turkish Word" },

  // ─── MATCH: Clean title, retry TMDB with hints ────────────────────────
  "A Woman Is a Woman": { action: "match", year: 1961 },
  "A Zed and Two Noughts (2026)": { action: "match", year: 1985 },
  "Avatar": { action: "match", year: 2009 },
  "Cat People (2026)": { action: "match", year: 1942 },
  "Charlie's Angels": { action: "match", year: 2000 },
  "DOA: A Right of Passage (1980)": { action: "match", year: 1980 },
  "Far from the Madding Crowd (2026)": { action: "match", year: 2015 },
  "Gone With The Wind": { action: "match", year: 1939 },
  "Hamlet (2026)": { action: "match" },
  "It Must Be Heaven": { action: "match", year: 2019 },
  "Kill Bill": { action: "match", year: 2003 },
  "Les Petroleuses": { action: "match", year: 1971 },
  "Little Amelie": { action: "match", year: 2025 },
  "Little Am\u00e9lie - dubbed (2025)": { action: "match", year: 2025 },
  "Little Am\u00e9lie - subtitled (2025)": { action: "match", year: 2025 },
  "Otto e Mezzo": { action: "match", year: 1963 },
  "Parasite": { action: "match", year: 2019 },
  "Quiet on Set": { action: "match", year: 2024 },
  "Rental Family": { action: "match", year: 2024 },
  "Solaris (1972)": { action: "match", year: 1972 },
  "The Conductor (2026)": { action: "match" },
  "The Intern": { action: "match", year: 2015 },
  "Wicked": { action: "match", year: 2024 },
  "Zootopia 2": { action: "match" },

  // ─── SKIP: Too obscure or ambiguous ───────────────────────────────────
  "A Wedding Suit + Bread and Alley": { action: "skip" },
  "Beyond": { action: "skip" },
  "Beyond: Saipan": { action: "skip" },
  "Diosa (2024)": { action: "skip" },
  "Five + Colours": { action: "skip" },
  "Fukushima: A Nuclear Nightmare (2026)": { action: "skip" },
  "Funky Stuff": { action: "skip" },
  "Hakkenden: Fiction and Reality": { action: "skip" },
  "Nina & the Hedgehog Secret": { action: "skip" },
  "Queer East presents Edhi Alice: Reverse (2024)": { action: "skip" },
  "Sandra": { action: "skip" },
  "SCARLET WARNING 666 (1974)": { action: "skip" },
  "Second Wind": { action: "skip" },
  "Shelter": { action: "skip" },
  "Still Pushing Pineapples (2025)": { action: "skip" },
  "Sudan, Remember Us": { action: "skip" },
  "Sumud / Life endures...": { action: "skip" },
  "The Audience": { action: "skip" },
  "The Devil": { action: "skip" },
  "The Experience + Orderly or Disorderly": { action: "skip" },
  "The Miraculous Transformation of the Working Class Into Foreigners": { action: "skip" },
  "The Moment": { action: "skip" },
  "The Sheperd and the Bear": { action: "skip" },
  "The Subnormal Scandal (2026)": { action: "skip" },
  "The Traveler": { action: "skip" },
  "The Traveler + Breaktime": { action: "skip" },
  "The Wedding": { action: "skip" },
  "Vinyl Sisters": { action: "skip" },
  "We (Nous)": { action: "skip" },
  "Zola (2026)": { action: "skip" },
};

// Build a normalized lookup index: strip trailing (YYYY) and trailing "..."
// so both "The Loveless (2026)" and "The Loveless" resolve to the same entry
function normalizeMapKey(title: string): string {
  return title
    .replace(/\s*\(\d{4}\)\s*$/, "")  // strip trailing (YYYY)
    .replace(/\.{3}$/, "")             // strip trailing ...
    .trim();
}

const FILM_MAP_NORMALIZED: Map<string, FilmAction> = new Map();
for (const [key, action] of Object.entries(FILM_MAP)) {
  // Store both the exact key and the normalized key
  FILM_MAP_NORMALIZED.set(key, action);
  const norm = normalizeMapKey(key);
  if (norm !== key && !FILM_MAP_NORMALIZED.has(norm)) {
    FILM_MAP_NORMALIZED.set(norm, action);
  }
}

// Additional DB title variants that differ from the plan's titles
// (longer suffixes, missing year tags, slight wording differences)
const DB_TITLE_OVERRIDES: Record<string, FilmAction> = {
  // Longer suffixes in DB vs truncated in plan
  "Pitchblack Playback: James Blake 'James Blake' (Deluxe - 15th Anniversary)": { action: "delete" },
  "Uneasy Balance - Two stories of Lebanese Identity and Displacement - I'm Migrant Film Festival": { action: "delete" },
  "Fractured Horizons: Three stories of migration and the desire for refuge": { action: "delete" },
  "The London International Animation Festival presents Wonderful Animated Shorts for 3 -12 year-olds": { action: "delete" },
  "Home Truths: Shorts exploring relationships and private lives - I'm Migrant Film Festival": { action: "delete" },
  "Black History Studies: Afeni Shakur and the Trial of the Black Panther 21 + Liberty Double Bill": { action: "delete" },
  "Reflecting on Stuart Hall's Impact in association with the Stuart Hall Foundation": { action: "delete" },
  "RuPaul's Drag Race: UK vs. the World Series 3.": { action: "delete" },
  "Pitchblack Playback: D'Angelo 'Live In Stockholm'": { action: "delete" },
  "National Theatre Live: Hamlet (2026)": { action: "delete" },
  // Variations without trailing year parens (map key has year)
  "Drink & Dine: Sinners + Listening Party": { action: "clean", cleanedTitle: "Sinners" },
  "La Belle et la Bete + pre-recorded intro by Chloe Cassens": { action: "clean", cleanedTitle: "La Belle et la B\u00eate", year: 1946 },
  "Collective Monologue + director Jessica Sarah Rinland in conversation with Erika Balsom": { action: "clean", cleanedTitle: "Collective Monologue" },
  "LRB Screen/London Reviewed: Night and the City (1950) with Ronan Bennett": { action: "clean", cleanedTitle: "Night and the City", year: 1950 },
  "The Lord of the Rings: The Fellowship of the Ring (25th Anniversary) + Peter Jackson Introduction": { action: "clean", cleanedTitle: "The Lord of the Rings: The Fellowship of the Ring", year: 2001 },
  "The War Trilogy: Kanal + pre-recorded intro by Professor Annette Insdorf, Columbia University": { action: "clean", cleanedTitle: "Kanal", year: 1957 },
  "Christine & Killer Sofa": { action: "clean", cleanedTitle: "Christine", year: 1983 },
  "NEVER WATCHING MOVIES: Spike Lee's SCHOOL DAZE": { action: "clean", cleanedTitle: "School Daze", year: 1988 },
  "CAFE FLESH": { action: "clean", cleanedTitle: "Cafe Flesh", year: 1982 },
  "NAKED KILLER (ON VHS)": { action: "clean", cleanedTitle: "Naked Killer", year: 1992 },
  "PERDITA DURANGO": { action: "clean", cleanedTitle: "Perdita Durango", year: 1997 },
  "Video Bazaar presents He Who Gets Slapped w/ Live Score": { action: "clean", cleanedTitle: "He Who Gets Slapped", year: 1924 },
  "Valentine's Throwback: Pretty Woman": { action: "clean", cleanedTitle: "Pretty Woman", year: 1990 },
  "UK PREMIERE Do You Love Me": { action: "clean", cleanedTitle: "Do You Love Me", year: 2025 },
  "UK PREMIERE Inventing the Future": { action: "clean", cleanedTitle: "Inventing the Future", year: 2020 },
  "Kids Club: The Princess and the Frog": { action: "clean", cleanedTitle: "The Princess and the Frog", year: 2009 },
  "Family Funday Preview: Stitch Head": { action: "clean", cleanedTitle: "Stitch Head" },
  "Seniors' Paid Matinee: My Father's Shadow": { action: "clean", cleanedTitle: "My Father's Shadow" },
  "MilkTea presents \u2013 UK Premiere: Last Days": { action: "clean", cleanedTitle: "Last Days" },
  "Queer East presents Miracle on Jongno Street": { action: "clean", cleanedTitle: "Miracle on Jongno Street", year: 2010 },
  "Little Am\u00e9lie - dubbed": { action: "match", year: 2025 },
  "Little Am\u00e9lie - subtitled": { action: "match", year: 2025 },
  "Sumud / Life endures: Three Stories from Palestine - I'm Migrant Film Festival": { action: "skip" },
  "Sudan, Remember Us - I'm Migrant Film Festival": { action: "skip" },
  "The Miraculous Transformation of the Working Class Into Foreigners - I'm Migrant Film Festival": { action: "skip" },
  "SCARLET WARNING 666": { action: "skip" },
  "Queer East presents Edhi Alice: Reverse": { action: "skip" },
  "It Must Be Heaven - I'm Migrant Film Festival": { action: "clean", cleanedTitle: "It Must Be Heaven", year: 2019 },
  "Sing-A-Long-A Grease": { action: "clean", cleanedTitle: "Grease", year: 1978 },
  "National Theatre Live: The Audience (Re-release)": { action: "delete" },
  "DocHouse: BAFTA-nominated Shorts": { action: "delete" },
  "Christine": { action: "clean", cleanedTitle: "Christine", year: 1983 },
  "Katyn + pre-recorded intro by film critic Carmen Gray": { action: "clean", cleanedTitle: "Katyn", year: 2007 },
};

for (const [key, action] of Object.entries(DB_TITLE_OVERRIDES)) {
  FILM_MAP_NORMALIZED.set(key, action);
}

function lookupFilm(rawTitle: string): FilmAction | undefined {
  // 1. Exact match on raw DB title
  const exact = FILM_MAP_NORMALIZED.get(rawTitle);
  if (exact) return exact;

  // 2. After HTML entity decoding
  const decoded = decodeHtmlEntities(rawTitle);
  const decodedMatch = FILM_MAP_NORMALIZED.get(decoded);
  if (decodedMatch) return decodedMatch;

  // 3. Normalized (strip year suffix)
  const norm = normalizeMapKey(decoded);
  if (norm !== decoded) {
    const normMatch = FILM_MAP_NORMALIZED.get(norm);
    if (normMatch) return normMatch;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? "DRY RUN \u2014 no changes will be written\n" : "Running Feb film cleanup\n");

  const now = new Date();

  // Find all films with tmdbId IS NULL that have upcoming screenings
  const rows = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        isNull(films.tmdbId),
        gte(screenings.datetime, now),
      )
    );

  console.log(`Found ${rows.length} films with upcoming screenings missing TMDB data\n`);

  const client = getTMDBClient();
  const stats = { deleted: 0, matched: 0, skipped: 0, unmatched: 0, notInMap: 0, duplicateSkip: 0 };

  for (let i = 0; i < rows.length; i++) {
    const film = rows[i];
    const decodedTitle = decodeHtmlEntities(film.title);
    const entry = lookupFilm(film.title);

    console.log(`[${i + 1}/${rows.length}] "${film.title}"`);

    if (!entry) {
      console.log(`  ? Not in classification map \u2014 skipping\n`);
      stats.notInMap++;
      continue;
    }

    // ── DELETE ───────────────────────────────────────────────────────────
    if (entry.action === "delete") {
      if (DRY_RUN) {
        console.log(`  [dry-run] Would DELETE film + cascading screenings\n`);
      } else {
        await db.delete(films).where(eq(films.id, film.id));
        console.log(`  DELETED\n`);
      }
      stats.deleted++;
      continue;
    }

    // ── SKIP ────────────────────────────────────────────────────────────
    if (entry.action === "skip") {
      console.log(`  -- Skipped (too obscure / ambiguous)\n`);
      stats.skipped++;
      continue;
    }

    // ── CLEAN or MATCH → attempt TMDB matching ──────────────────────────
    let searchTitle: string;
    let yearHint: number | undefined;

    if (entry.action === "clean") {
      searchTitle = entry.cleanedTitle;
      yearHint = entry.year;
      console.log(`  -> Cleaned: "${searchTitle}"${yearHint ? ` (${yearHint})` : ""}`);
    } else {
      // match — use decoded title, stripping year suffix
      searchTitle = decodedTitle.replace(/\s*\(\d{4}\)\s*$/, "");
      yearHint = entry.year;
      console.log(`  -> Match with hints: "${searchTitle}"${yearHint ? ` (${yearHint})` : ""}`);
    }

    try {
      const tmdbMatch = await matchFilmToTMDB(searchTitle, {
        year: yearHint,
        director: film.directors[0],
        skipAmbiguityCheck: true,
      });

      if (!tmdbMatch) {
        console.log(`  X No TMDB match\n`);
        stats.unmatched++;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
        continue;
      }

      console.log(`  -> TMDB: "${tmdbMatch.title}" (${tmdbMatch.year}) [ID: ${tmdbMatch.tmdbId}, conf: ${tmdbMatch.confidence.toFixed(2)}]`);

      if (DRY_RUN) {
        console.log(`  [dry-run] Would update film record\n`);
        stats.matched++;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
        continue;
      }

      // Check for duplicate TMDB ID
      const existing = await db
        .select({ id: films.id, title: films.title })
        .from(films)
        .where(eq(films.tmdbId, tmdbMatch.tmdbId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ~ Duplicate: TMDB ${tmdbMatch.tmdbId} already on "${existing[0].title}" \u2014 skipping\n`);
        stats.duplicateSkip++;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
        continue;
      }

      // Fetch full data and update
      const details = await client.getFullFilmData(tmdbMatch.tmdbId);

      await db
        .update(films)
        .set({
          tmdbId: tmdbMatch.tmdbId,
          imdbId: details.details.imdb_id || null,
          title: details.details.title,
          originalTitle: details.details.original_title,
          year: tmdbMatch.year,
          runtime: details.details.runtime || null,
          directors: details.directors.length > 0 ? details.directors : film.directors,
          cast: details.cast.length > 0 ? details.cast : [],
          genres: details.details.genres.map((g) => g.name.toLowerCase()),
          countries: details.details.production_countries.map((c) => c.iso_3166_1),
          languages: details.details.spoken_languages.map((l) => l.iso_639_1),
          certification: details.certification || null,
          synopsis: details.details.overview || null,
          tagline: details.details.tagline || null,
          posterUrl: details.details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
            : null,
          backdropUrl: details.details.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
            : null,
          tmdbRating: details.details.vote_average,
          matchConfidence: tmdbMatch.confidence,
          matchStrategy: "manual-cleanup-feb",
          matchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      console.log(`  -> Updated\n`);
      stats.matched++;
    } catch (error) {
      console.error(`  X Error: ${error}\n`);
      stats.skipped++;
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  console.log(`Deleted:        ${stats.deleted}`);
  console.log(`TMDB matched:   ${stats.matched}`);
  console.log(`Unmatched:      ${stats.unmatched}`);
  console.log(`Skipped:        ${stats.skipped}`);
  console.log(`Duplicate skip: ${stats.duplicateSkip}`);
  console.log(`Not in map:     ${stats.notInMap}`);
  console.log(`Total:          ${rows.length}`);
  if (DRY_RUN) console.log("\n(Dry run \u2014 no changes were written)");
}

main()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
