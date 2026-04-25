import type { FilterProgrammingType } from '$lib/constants/filters';
import { toLondonDateStr } from '$lib/utils';

// Minimal structural type the filter cares about; intentionally narrower
// than the full `+page.server.ts` payload so callers can pass either the
// home payload or a film-detail payload as long as it has these fields.
export interface CalendarScreening {
	id: string;
	datetime: string;
	format: string | null;
	bookingUrl: string;
	film: {
		id: string;
		title: string;
		year: number | null;
		director: string | null;
		genres: string[];
		runtime: number | null;
		posterUrl: string | null;
		isRepertory: boolean;
		letterboxdRating: number | null;
		tmdbPopularity: number | null;
	} | null;
	cinema: {
		id: string;
		name: string;
		shortName: string | null;
	} | null;
}

export interface CalendarFilterSnapshot {
	filmSearch: string;
	cinemaIds: string[];
	dateFrom: string | null;
	dateTo: string | null;
	formats: string[];
	timeFrom: number | null;
	timeTo: number | null;
	programmingTypes: FilterProgrammingType[];
	genres: string[];
	decades: string[];
}

export interface CalendarFilterContext {
	/** Today's London civil date, e.g. "2026-04-25". Used as the default
	 * range bound when neither `dateFrom` nor `dateTo` is set on the snapshot. */
	today: string;
	/** "Now" instant in ms-since-epoch — screenings before this are excluded
	 * as already-started. Passed in (rather than read inline) so tests can
	 * pin the clock and SSR can pass `Date.now()` from the request boundary. */
	now: number;
}

export interface FilmGroup<S extends CalendarScreening = CalendarScreening> {
	film: NonNullable<S['film']>;
	screenings: S[];
}

/**
 * Group upcoming screenings by film, applying the active filters.
 *
 * Behavioural contract (locked in by tests + the lock-in Playwright assert):
 * - Excludes screenings whose `datetime` is at or before `now`.
 * - Excludes screenings without a `film`.
 * - Date range defaults to `[today, today]` when neither end is set on the
 *   snapshot (matches the masthead's single-day framing on the homepage).
 * - All date comparisons use London civil dates, never UTC ISO slices.
 * - Screenings are bucketed by `film.id` in insertion order; the caller is
 *   responsible for any ordering.
 */
export function buildFilmMap<S extends CalendarScreening>(
	screenings: S[],
	filters: CalendarFilterSnapshot,
	{ today, now }: CalendarFilterContext
): Map<string, FilmGroup<S>> {
	const map = new Map<string, FilmGroup<S>>();
	const effectiveFrom = filters.dateFrom ?? today;
	const effectiveTo = filters.dateTo ?? today;
	const searchQuery = filters.filmSearch ? filters.filmSearch.toLowerCase() : '';

	for (const s of screenings) {
		if (!s.film) continue;
		if (new Date(s.datetime).getTime() <= now) continue;

		if (searchQuery) {
			const matches =
				s.film.title.toLowerCase().includes(searchQuery) ||
				(s.cinema?.name?.toLowerCase().includes(searchQuery) ?? false) ||
				(s.film.director?.toLowerCase().includes(searchQuery) ?? false);
			if (!matches) continue;
		}
		if (filters.cinemaIds.length > 0 && !filters.cinemaIds.includes(s.cinema?.id ?? '')) continue;

		const dateStr = toLondonDateStr(s.datetime);
		if (dateStr < effectiveFrom) continue;
		if (dateStr > effectiveTo) continue;

		if (filters.formats.length > 0 && (!s.format || !filters.formats.includes(s.format))) continue;

		if (filters.timeFrom !== null && filters.timeTo !== null) {
			const hour = parseInt(
				new Date(s.datetime).toLocaleString('en-GB', {
					hour: 'numeric',
					hour12: false,
					timeZone: 'Europe/London'
				})
			);
			if (hour < filters.timeFrom || hour > filters.timeTo) continue;
		}

		if (filters.programmingTypes.length > 0) {
			const isRepertory = s.film.isRepertory;
			const matchesAny = filters.programmingTypes.some((type) =>
				type === 'repertory' ? isRepertory : !isRepertory
			);
			if (!matchesAny) continue;
		}

		if (filters.genres.length > 0) {
			// Chip keys are lowercase canonical genre names; `film.genres`
			// is already lowercased by the backend pipeline.
			const filmGenres = (s.film.genres ?? []).map((g) => g.toLowerCase());
			if (!filters.genres.some((g) => filmGenres.includes(g))) continue;
		}

		if (filters.decades.length > 0) {
			if (!s.film.year) continue;
			// Label convention: '2020s' / '2010s' / '2000s' for 2000+ eras,
			// '90s' / '80s' / '70s' for 1970s–1990s, 'Pre-1970' for anything
			// earlier. Matches the chip labels in both filter surfaces.
			let decade: string;
			if (s.film.year < 1970) {
				decade = 'Pre-1970';
			} else if (s.film.year >= 2000) {
				decade = `${Math.floor(s.film.year / 10) * 10}s`;
			} else {
				decade = `${Math.floor((s.film.year % 100) / 10) * 10}s`;
			}
			if (!filters.decades.includes(decade)) continue;
		}

		const existing = map.get(s.film.id);
		if (existing) existing.screenings.push(s);
		else map.set(s.film.id, { film: s.film as NonNullable<S['film']>, screenings: [s] });
	}
	return map;
}
