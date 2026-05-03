/**
 * Enrichment regression fixtures — the "must beat this" baseline.
 *
 * Every entry below is a real failure observed in the production patrol
 * logs. The full taxonomy lives at:
 *   Pictures/Research/scraping-rethink-2026-05/07-internal-archaeology.md
 *
 * These fixtures are checked into git (immutable). Any future automated
 * "learnings" mechanism MUST be append-only — never silently overwrite
 * this file. (See Stream 6's append-only design for the planned
 * `enrichment_corrections` PG table.)
 *
 * The fixture set breaks down as:
 *   - 74 cinema-curatorial title prefixes (Stream 7 synthesis quoted "57"
 *     based on an earlier learnings-file snapshot; the full archaeological
 *     dig in 07-internal-archaeology.md §4 lists 74 distinct entries)
 *   - 26 suffix variants (anniversary tags, restoration tags, talk-back tags)
 *   - 18 wrong-TMDB-match cases
 *   - 10 director-normalisation transliteration pairs
 *   - 8 bilingual title pairs (Spanish/English, Czech/English, etc.)
 *   = 136 total fixtures
 *
 * Convention: ALL prefixes/suffixes here are case-preserving. Any
 * downstream stripping logic must be case-insensitive (because patrols
 * have observed both `Relaxed Screening:` and `Relaxed screening:` in
 * the wild).
 */

/**
 * Cinema-curatorial title prefixes that should be stripped before TMDB
 * matching. Compiled from patrols 2026-04-26 → 2026-05-03 + the
 * historical `prefixesToStrip` list. 74 entries.
 *
 * These are NOT scraper-side junk — they're brand-level curatorial
 * framing the cinema applies to every screening in a given strand.
 * Stripping them is mandatory before TMDB lookup.
 */
export const CINEMA_CURATORIAL_PREFIXES = [
  "Member Picks:",
  "Members' Preview:",
  "Member exclusive:",
  "Member Library Lates:",
  "Relaxed Screening:",
  "Relaxed screening:",
  "Parent & Baby:",
  "Parent & Baby Screening:",
  "Parents and Baby:",
  "Parents and Baby screening:",
  "Seniors' Matinee:",
  "Senior Community Cinema:",
  "Senior Community Cinema x The Old Ways:",
  "Lexi Seniors' Film Club:",
  "Family Film Club:",
  "Film Club:",
  "Kids Club:",
  "FFC x The Old Ways:",
  "Throwback:",
  "Drink & Dine:",
  "Classic Matinee:",
  "Cine-Real presents:",
  "Outdoor:",
  "Funday:",
  "Funday Workshop:",
  "LOCO presents:",
  "LOCO Shorts 2026 presents:",
  "LAFS PRESENTS:",
  "Lina Wertmüller:",
  "Niki de Saint Phalle:",
  "Funeral Parade presents",
  "Re:Mind Film Festival presents",
  "Reece Shearsmith Presents:",
  "Steve Pemberton presents",
  "Spike Jonze in Conversation",
  "Sürreal Sinema:",
  "Never Watching Movies:",
  "New Writings:",
  "EXHIBITION ON SCREEN:",
  "TV Preview:",
  "The Old Ways:",
  "RIO FOREVER:",
  "RIO FOREVER X QUEER EAST:",
  "Queer East Festival:",
  "QUEER EAST:",
  "Queer Horror Nights:",
  "Pitchblack Playback:",
  "Pixelated Lesbian Mixtape:",
  "Team Picks:",
  "DocHouse:",
  "Doc'n Roll x Rio:",
  "COSMIK DEBRIS PRESENTS:",
  "BETTER THAN NOTHING PRESENTS:",
  "KNEE JERK PRESENTS:",
  "UKAFF presents:",
  "East London Doc Club:",
  "Animus Magazine presents",
  "Habeshaview Monthly Cinema:",
  "Chronic Youth Film Festival:",
  "Cold War Visions:",
  "TALENTED U:",
  "Special Presentation:",
  "Ritzy Presents...",
  "MET Opera Live:",
  "MET Opera Encore:",
  "Met Opera Encore:",
  "MJF No. 83 Launch Screening:",
  "Skate Shorts",
  "Bar Shorts",
  "Site&Sound 10:",
  "Hackney History Festival presents:",
  "Violet Hour presents:",
  "Jme Presents:",
  "Kung Fu Cinema:",
] as const;

/**
 * Suffix variants — appendages added by chain scrapers (anniversary,
 * restoration, format, talk-back). Same dedup family as prefixes:
 * `Top Gun (40th Anniversary)`, `Stalker - Birthday Season`,
 * `Barry Lyndon (4K Restoration)`. 26 entries.
 *
 * Stripping these is what collapses Genesis Cinema's "Birthday Season"
 * factory (Stalker, Space Jam, Spice World, Pather Panchali, Petite
 * Maman, Metropolis, Nil By Mouth, Holy Mountain, Seven Samurai) into
 * the canonical TMDB rows.
 */
export const TITLE_SUFFIXES_TO_STRIP = [
  "- Birthday Season",
  "- Birthday Screening",
  "(4K Restoration)",
  "(4K Remaster)",
  "(35mm)",
  "(VHS SCREENING)",
  "(Extended Cut)",
  "(Director's Cut)",
  "(B&W)",
  "- 25th Anniversary",
  "- 40th Anniversary",
  "- 50th Anniversary",
  "- 90th Anniversary",
  "- UK Premiere",
  "(UK Premiere)",
  "(World Premiere)",
  "(London Premiere + Q&A)",
  "(UK Premiere + Q&A)",
  "(Dog Friendly Screening)",
  "+ in conversation",
  "+ Q&A",
  "+ Live Organ",
  "+ Live Score",
  "+ podcast",
  "+ ScreenTalk",
  "+ pre-recorded intro",
] as const;

/**
 * Wrong-TMDB regression cases. Each row encodes a specific historical
 * failure: a title that the matcher resolved to the wrong TMDB id, plus
 * the correct id (if known) and a one-line explanation.
 *
 * The matcher must NOT pick the bad id when given the input title +
 * cinema id. New regression tests should run each case through
 * `matchFilmToTMDB(title, cinemaId)` and assert the bad id is NOT
 * returned. (When `correctTmdbId` is known, also assert it IS returned.)
 *
 * 18 cases — see Stream 7 §5 for full sources.
 */
export const WRONG_TMDB_REGRESSION_CASES = [
  {
    title: "Dracula",
    cinemaId: "ica",
    badTmdbId: 1246049,
    correctTmdbId: 1323409,
    note: "Most-popular wins; DB had [Radu Jude] director ignored",
  },
  {
    title: "Cronos",
    cinemaId: "bfi-southbank",
    badTmdbId: 1549315,
    correctTmdbId: 11655,
    note: "Year-matched stub (runtime=0)",
  },
  {
    title: "Relaxed Screening: My Father's Shadow",
    cinemaId: "barbican",
    badTmdbId: 377626,
    correctTmdbId: 1432605,
    note: "Prefix-as-title; matched to 1998 TV movie about Sam Sheppard murder case",
  },
  {
    title: "Tenet",
    cinemaId: "bfi-imax",
    badTmdbId: 1383668,
    correctTmdbId: 577922,
    note: "2024 Portuguese stub beat the 2020 Nolan blockbuster",
  },
  {
    title: "The Old Ways: A Century in Sound",
    cinemaId: "barbican",
    badTmdbId: 752505,
    correctTmdbId: 1249264,
    note: "Prefix-as-title; Barbican Senior Community Cinema brand",
  },
  {
    title: "Throwback: Top Gun (40th Anniversary)",
    cinemaId: "everyman-king's-cross",
    badTmdbId: 1482511,
    correctTmdbId: 744,
    note: "Prefix+suffix; matcher found same-subject doc",
  },
  {
    title: "Throwback: Legally Blonde (25th Anniversary)",
    cinemaId: "everyman-king's-cross",
    badTmdbId: 484847,
    correctTmdbId: 8835,
    note: "Stage-musical of same brand",
  },
  {
    title: "Daisies (Sedmikrásky)",
    cinemaId: "bfi-southbank",
    badTmdbId: 1422,
    correctTmdbId: 46919,
    note: "Hardcoded id from LLM memory pointed to The Departed",
  },
  {
    title: "Badlands",
    cinemaId: "bfi-southbank",
    badTmdbId: 10009,
    correctTmdbId: 3133,
    note: "Hardcoded id pointed to Brother Bear 2003",
  },
  {
    title: "Barry Lyndon (50th Anniversary)",
    cinemaId: "picturehouse-central",
    badTmdbId: 11868,
    correctTmdbId: 3175,
    note: "Hardcoded id pointed to Hammer Dracula 1958",
  },
  {
    title: "Classic Matinee: THE FULL MONTY",
    cinemaId: "picturehouse-central",
    badTmdbId: 11518,
    correctTmdbId: 9427,
    note: "Hardcoded id; prefix stripped wrong",
  },
  {
    title: "David Attenborough: A Life on Our Planet",
    cinemaId: "garden",
    badTmdbId: 698906,
    correctTmdbId: 664280,
    note: "Hardcoded id merged 8 screenings before rollback",
  },
  {
    title: "New Writings: In the Scene: Agnes Varda",
    cinemaId: "bfi-southbank",
    badTmdbId: 1220205,
    correctTmdbId: null,
    note: "Talk *about* Varda mistaken for film *by* her — no canonical, this is an event",
  },
  {
    title: "Member Library Lates: Guillermo del Toro",
    cinemaId: "bfi-southbank",
    badTmdbId: 1264957,
    correctTmdbId: null,
    note: "Junk-stub auto-import + is_repertory wrongly set — also an event",
  },
  {
    title: "Small Axe: Lovers Rock",
    cinemaId: null,
    badTmdbId: 726982,
    correctTmdbId: null,
    note: "Trusted learnings file ITSELF was wrong — pointed to Pussy Willie 1929 cartoon. Self-modifying authoritative state must never happen again. Small Axe is a 2020 BBC TV anthology.",
  },
  {
    title: "Niki de Saint Phalle: 4k Restoration Daddy",
    cinemaId: "the-nickel",
    badTmdbId: null,
    correctTmdbId: 186304,
    note: "Concat-bug variant; title concatenated film, directors=single concat string",
  },
  {
    title: "Niagara",
    cinemaId: "cine-lumiere",
    badTmdbId: 571975,
    correctTmdbId: 764838,
    note: "Cinema context not used; matched to 1999 doc, correct is Niagara 2022 French",
  },
  {
    title: "The Photograph",
    cinemaId: "garden",
    badTmdbId: 270286,
    correctTmdbId: null,
    note: "Substring fails on transliteration: Nikos Papatakis (TMDB) vs Nico Papatakis (DB)",
  },
] as const;

/**
 * Director-name transliteration pairs. The matcher's substring check
 * must be normalised (case-insensitive, accent-folded) and accept
 * common transliteration variants.
 */
export const DIRECTOR_NORMALISATION_PAIRS = [
  { canonical: "Nico Papatakis", variant: "Nikos Papatakis" },
  { canonical: "Béla Tarr", variant: "Bela Tarr" },
  { canonical: "Andrzej Wajda", variant: "Andrei Wajda" },
  { canonical: "Krzysztof Kieślowski", variant: "Krzysztof Kieslowski" },
  { canonical: "Sergei Parajanov", variant: "Sergei Paradjanov" },
  { canonical: "Federico Fellini", variant: "F. Fellini" },
  { canonical: "Luis Buñuel", variant: "Luis Bunuel" },
  { canonical: "Andrei Tarkovsky", variant: "Andrey Tarkovsky" },
  { canonical: "François Truffaut", variant: "Francois Truffaut" },
  { canonical: "Akira Kurosawa", variant: "Kurosawa Akira" },
] as const;

/**
 * Bilingual title pairs that must merge to a single canonical film.
 * Spanish/English, Czech/English, French/English, etc. The matcher
 * must recognise these as the same entity, not separate films.
 *
 * 8 cases — drawn from patrol logs and Stream 7 §2.
 */
export const BILINGUAL_TITLE_PAIRS = [
  { english: "Nine Queens", original: "Nueve reinas" },
  { english: "Daisies", original: "Sedmikrásky" },
  { english: "Wild Strawberries", original: "Smultronstället" },
  { english: "The Battle of Algiers", original: "La Battaglia di Algeri" },
  { english: "The Mirror", original: "Зеркало" },
  { english: "Bicycle Thieves", original: "Ladri di biciclette" },
  { english: "The Seventh Seal", original: "Det sjunde inseglet" },
  { english: "Tokyo Story", original: "東京物語" },
] as const;

/**
 * Total fixture count — exposed for test summary reporting.
 */
export const FIXTURE_COUNTS = {
  prefixes: CINEMA_CURATORIAL_PREFIXES.length,
  suffixes: TITLE_SUFFIXES_TO_STRIP.length,
  wrongTmdb: WRONG_TMDB_REGRESSION_CASES.length,
  directors: DIRECTOR_NORMALISATION_PAIRS.length,
  bilingual: BILINGUAL_TITLE_PAIRS.length,
  get total(): number {
    return (
      this.prefixes + this.suffixes + this.wrongTmdb + this.directors + this.bilingual
    );
  },
} as const;
