/**
 * Test Fixtures
 * Sample data for use in tests
 */

import type { FilmStatus, FilmStatusEntry } from "@/stores/film-status";
import type { FilterState, TimeOfDay, ProgrammingType } from "@/stores/filters";

// =============================================================================
// Date Fixtures
// =============================================================================

/** Fixed date for consistent testing - Monday 2025-01-06 at noon UTC */
export const TEST_DATE = new Date("2025-01-06T12:00:00Z");

/** Tomorrow's date relative to TEST_DATE */
export const TEST_TOMORROW = new Date("2025-01-07T12:00:00Z");

/** This weekend dates (Saturday/Sunday) */
export const TEST_WEEKEND_START = new Date("2025-01-11T00:00:00Z");
export const TEST_WEEKEND_END = new Date("2025-01-12T23:59:59Z");

// =============================================================================
// Cinema Fixtures
// =============================================================================

export interface TestCinema {
  id: string;
  name: string;
  slug: string;
  chain: string | null;
  address: string;
  latitude: number;
  longitude: number;
}

export const TEST_CINEMAS: TestCinema[] = [
  {
    id: "bfi-southbank",
    name: "BFI Southbank",
    slug: "bfi-southbank",
    chain: "BFI",
    address: "Belvedere Road, South Bank, London SE1 8XT",
    latitude: 51.5067,
    longitude: -0.1152,
  },
  {
    id: "prince-charles-cinema",
    name: "Prince Charles Cinema",
    slug: "prince-charles-cinema",
    chain: null,
    address: "7 Leicester Place, London WC2H 7BY",
    latitude: 51.5106,
    longitude: -0.1296,
  },
  {
    id: "curzon-soho",
    name: "Curzon Soho",
    slug: "curzon-soho",
    chain: "Curzon",
    address: "99 Shaftesbury Avenue, London W1D 5DY",
    latitude: 51.5132,
    longitude: -0.1289,
  },
  {
    id: "rio-cinema",
    name: "Rio Cinema",
    slug: "rio-cinema",
    chain: null,
    address: "107 Kingsland High Street, London E8 2PB",
    latitude: 51.5485,
    longitude: -0.0755,
  },
  {
    id: "everyman-screen-on-the-green",
    name: "Everyman Screen on the Green",
    slug: "everyman-screen-on-the-green",
    chain: "Everyman",
    address: "83 Upper Street, London N1 0NP",
    latitude: 51.5395,
    longitude: -0.1026,
  },
];

/** Get a cinema by ID */
export function getCinema(id: string): TestCinema | undefined {
  return TEST_CINEMAS.find((c) => c.id === id);
}

/** Get all independent cinemas (no chain or BFI) */
export function getIndependentCinemas(): TestCinema[] {
  return TEST_CINEMAS.filter((c) => c.chain === null || c.chain === "BFI");
}

/** Get all chain cinemas */
export function getChainCinemas(): TestCinema[] {
  return TEST_CINEMAS.filter((c) => c.chain !== null && c.chain !== "BFI");
}

// =============================================================================
// Film Fixtures
// =============================================================================

export interface TestFilm {
  id: string;
  title: string;
  cleanTitle: string;
  year: number;
  directors: string[];
  runtime: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  tmdbId: number | null;
  isRepertory: boolean;
}

export const TEST_FILMS: TestFilm[] = [
  {
    id: "film-1",
    title: "2001: A Space Odyssey",
    cleanTitle: "2001: A Space Odyssey",
    year: 1968,
    directors: ["Stanley Kubrick"],
    runtime: 149,
    posterUrl: "https://image.tmdb.org/t/p/w500/ve72VxNqjGM69Pk8gWyuDnV9C4l.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/mMZRKb3NVo5ZeSPEIaNW9buLWQ0.jpg",
    genres: ["Science Fiction"],
    tmdbId: 62,
    isRepertory: true,
  },
  {
    id: "film-2",
    title: "The Substance",
    cleanTitle: "The Substance",
    year: 2024,
    directors: ["Coralie Fargeat"],
    runtime: 141,
    posterUrl: "https://image.tmdb.org/t/p/w500/lqoMzCcZYEFK729d6qzt349fB4o.jpg",
    backdropUrl: null,
    genres: ["Horror", "Thriller"],
    tmdbId: 933260,
    isRepertory: false,
  },
  {
    id: "film-3",
    title: "Mulholland Drive",
    cleanTitle: "Mulholland Drive",
    year: 2001,
    directors: ["David Lynch"],
    runtime: 147,
    posterUrl: "https://image.tmdb.org/t/p/w500/tVxGt7uffLVhIIcwuldKPKXS8CE.jpg",
    backdropUrl: null,
    genres: ["Mystery", "Drama", "Thriller"],
    tmdbId: 1018,
    isRepertory: true,
  },
  {
    id: "film-4",
    title: "Anora",
    cleanTitle: "Anora",
    year: 2024,
    directors: ["Sean Baker"],
    runtime: 139,
    posterUrl: null,
    backdropUrl: null,
    genres: ["Drama", "Comedy"],
    tmdbId: 1064213,
    isRepertory: false,
  },
  {
    id: "film-5",
    title: "Nosferatu",
    cleanTitle: "Nosferatu",
    year: 2024,
    directors: ["Robert Eggers"],
    runtime: 132,
    posterUrl: null,
    backdropUrl: null,
    genres: ["Horror"],
    tmdbId: 426063,
    isRepertory: false,
  },
];

/** Get a film by ID */
export function getFilm(id: string): TestFilm | undefined {
  return TEST_FILMS.find((f) => f.id === id);
}

/** Get repertory films only */
export function getRepertoryFilms(): TestFilm[] {
  return TEST_FILMS.filter((f) => f.isRepertory);
}

// =============================================================================
// Screening Fixtures
// =============================================================================

export interface TestScreening {
  id: string;
  filmId: string;
  cinemaId: string;
  datetime: Date;
  bookingUrl: string;
  format: string | null;
  is35mm: boolean;
  is70mm: boolean;
  isImax: boolean;
  notes: string | null;
}

/** Generate screenings for the test date */
export function createTestScreenings(): TestScreening[] {
  const today = TEST_DATE;
  const tomorrow = TEST_TOMORROW;

  return [
    // 2001: A Space Odyssey at BFI (70mm)
    {
      id: "scr-1",
      filmId: "film-1",
      cinemaId: "bfi-southbank",
      datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 30),
      bookingUrl: "https://whatson.bfi.org.uk/booking/12345",
      format: "70mm",
      is35mm: false,
      is70mm: true,
      isImax: false,
      notes: "70mm print",
    },
    // 2001 again at PCC (35mm)
    {
      id: "scr-2",
      filmId: "film-1",
      cinemaId: "prince-charles-cinema",
      datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0),
      bookingUrl: "https://princecharlescinema.com/booking/12345",
      format: "35mm",
      is35mm: true,
      is70mm: false,
      isImax: false,
      notes: null,
    },
    // The Substance at Curzon
    {
      id: "scr-3",
      filmId: "film-2",
      cinemaId: "curzon-soho",
      datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 15),
      bookingUrl: "https://curzon.com/booking/12345",
      format: null,
      is35mm: false,
      is70mm: false,
      isImax: false,
      notes: null,
    },
    // Mulholland Drive at Rio (tomorrow)
    {
      id: "scr-4",
      filmId: "film-3",
      cinemaId: "rio-cinema",
      datetime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 19, 30),
      bookingUrl: "https://riocinema.org.uk/booking/12345",
      format: null,
      is35mm: false,
      is70mm: false,
      isImax: false,
      notes: null,
    },
    // Anora at Everyman
    {
      id: "scr-5",
      filmId: "film-4",
      cinemaId: "everyman-screen-on-the-green",
      datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 21, 0),
      bookingUrl: "https://everymancinema.com/booking/12345",
      format: null,
      is35mm: false,
      is70mm: false,
      isImax: false,
      notes: null,
    },
    // Nosferatu at BFI (morning screening)
    {
      id: "scr-6",
      filmId: "film-5",
      cinemaId: "bfi-southbank",
      datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 0),
      bookingUrl: "https://whatson.bfi.org.uk/booking/67890",
      format: null,
      is35mm: false,
      is70mm: false,
      isImax: false,
      notes: null,
    },
  ];
}

export const TEST_SCREENINGS = createTestScreenings();

// =============================================================================
// Filter State Fixtures
// =============================================================================

/** Create a filter state with specific values */
export function createFilterState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    filmSearch: "",
    cinemaIds: [],
    dateFrom: null,
    dateTo: null,
    timeFrom: null,
    timeTo: null,
    formats: [],
    programmingTypes: [],
    decades: [],
    genres: [],
    timesOfDay: [],
    festivalSlug: null,
    festivalOnly: false,
    hideSeen: false,
    hideNotInterested: true,
    onlySingleShowings: false,
    updatedAt: TEST_DATE.toISOString(),
    ...overrides,
  };
}

/** Filter state with cinema selected */
export const FILTER_WITH_CINEMA = createFilterState({
  cinemaIds: ["bfi-southbank"],
});

/** Filter state with format filter */
export const FILTER_WITH_FORMAT = createFilterState({
  formats: ["35mm", "70mm"],
});

/** Filter state with multiple filters active */
export const FILTER_COMPLEX = createFilterState({
  cinemaIds: ["bfi-southbank", "prince-charles-cinema"],
  formats: ["35mm"],
  decades: ["1960s"],
  hideSeen: true,
});

// =============================================================================
// Film Status Fixtures
// =============================================================================

/** Create a film status entry */
export function createFilmStatusEntry(
  status: FilmStatus,
  overrides: Partial<FilmStatusEntry> = {}
): FilmStatusEntry {
  return {
    status,
    addedAt: TEST_DATE.toISOString(),
    updatedAt: TEST_DATE.toISOString(),
    ...overrides,
  };
}

/** Sample film statuses for testing */
export const TEST_FILM_STATUSES: Record<string, FilmStatusEntry> = {
  "film-1": createFilmStatusEntry("want_to_see", {
    filmTitle: "2001: A Space Odyssey",
    filmYear: 1968,
  }),
  "film-3": createFilmStatusEntry("seen", {
    filmTitle: "Mulholland Drive",
    filmYear: 2001,
    seenAt: TEST_DATE.toISOString(),
    rating: 5,
  }),
  "film-5": createFilmStatusEntry("not_interested", {
    filmTitle: "Nosferatu",
    filmYear: 2024,
  }),
};

// =============================================================================
// Festival Fixtures
// =============================================================================

export interface TestFestival {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
}

export const TEST_FESTIVALS: TestFestival[] = [
  {
    id: "fest-1",
    slug: "london-film-festival",
    name: "BFI London Film Festival",
    description: "The UK's biggest film festival",
    startDate: new Date("2025-10-08"),
    endDate: new Date("2025-10-19"),
  },
  {
    id: "fest-2",
    slug: "frightfest",
    name: "FrightFest",
    description: "Horror film festival",
    startDate: new Date("2025-08-21"),
    endDate: new Date("2025-08-25"),
  },
];

// =============================================================================
// User Fixtures
// =============================================================================

export const TEST_USER = {
  id: "user_test123",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
};

export const TEST_AUTHENTICATED_USER = {
  ...TEST_USER,
  isSignedIn: true,
};
