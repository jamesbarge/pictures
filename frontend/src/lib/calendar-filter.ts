import type { FilterProgrammingType } from '$lib/constants/filters';
import { toLondonDateStr } from '$lib/utils';

// Minimal structural type — only the fields `buildFilmMap` actually reads.
// Callers can pass any wider type that satisfies this constraint; the output
// preserves the caller's full screening shape via the `<S>` generic on
// `FilmGroup`, so the homepage's richer payload (poster, runtime, ratings,
// etc.) flows through untouched.
export interface CalendarScreening {
	id: string;
	datetime: string;
	format: string | null;
	film: {
		id: string;
		title: string;
		year: number | null;
		director: string | null;
		genres: string[];
		isRepertory: boolean;
	} | null;
	cinema: {
		id: string;
		name: string;
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

// Module-scope dedup for the one-sided-range invariant warning. Lives here
// (rather than in the calling component) because the invariant is about the
// helper's own input — a future caller breaking the convention should be
// surfaced regardless of which Svelte component happened to invoke us.
let lastOneSidedRangeWarnKey = '';

/**
 * Group upcoming screenings by film, applying the active filters.
 *
 * Behavioural contract:
 * - Excludes screenings whose `datetime` is at or before `now`.
 * - Excludes screenings without a `film`.
 * - Date range defaults to `[today, ∞)` when neither end is set on the
 *   snapshot — the homepage shows a rolling multi-day window and slices the
 *   visible days downstream in `+page.svelte`.
 * - A `dateFrom`-only range (no `dateTo`) is valid: it anchors the rolling
 *   window from that date forward.
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
	// '9999-12-31' is string-compare-safe since YYYY-MM-DD sorts lexicographically;
	// any real screening date is strictly less.
	const effectiveTo = filters.dateTo ?? '9999-12-31';
	const searchQuery = filters.filmSearch ? filters.filmSearch.toLowerCase() : '';

	// A `dateTo`-only range (with no `dateFrom`) is unusual — every UI surface
	// that exposes a single-day filter sets both ends. Warn in dev so a drifting
	// caller surfaces instead of silently defaulting `dateFrom` to today.
	if (
		import.meta.env.DEV &&
		filters.dateFrom === null &&
		filters.dateTo !== null
	) {
		const key = `${filters.dateFrom}|${filters.dateTo}`;
		if (lastOneSidedRangeWarnKey !== key) {
			lastOneSidedRangeWarnKey = key;
			console.warn('buildFilmMap: dateTo set without dateFrom', {
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo
			});
		}
	}

	for (const s of screenings) {
		const film = s.film;
		if (!film) continue;

		const dt = new Date(s.datetime);
		const dtMs = dt.getTime();
		if (dtMs <= now) continue;

		if (searchQuery) {
			const matches =
				film.title.toLowerCase().includes(searchQuery) ||
				(s.cinema?.name?.toLowerCase().includes(searchQuery) ?? false) ||
				(film.director?.toLowerCase().includes(searchQuery) ?? false);
			if (!matches) continue;
		}
		if (filters.cinemaIds.length > 0 && !filters.cinemaIds.includes(s.cinema?.id ?? '')) continue;

		const dateStr = toLondonDateStr(s.datetime);
		if (dateStr < effectiveFrom) continue;
		if (dateStr > effectiveTo) continue;

		if (filters.formats.length > 0 && (!s.format || !filters.formats.includes(s.format))) continue;

		if (filters.timeFrom !== null && filters.timeTo !== null) {
			const hour = parseInt(
				dt.toLocaleString('en-GB', {
					hour: 'numeric',
					hour12: false,
					timeZone: 'Europe/London'
				}),
				10
			);
			if (hour < filters.timeFrom || hour > filters.timeTo) continue;
		}

		if (filters.programmingTypes.length > 0) {
			const isRepertory = film.isRepertory;
			const matchesAny = filters.programmingTypes.some((type) =>
				type === 'repertory' ? isRepertory : !isRepertory
			);
			if (!matchesAny) continue;
		}

		if (filters.genres.length > 0) {
			// Chip keys are lowercase canonical genre names; `film.genres`
			// is already lowercased by the backend pipeline.
			const filmGenres = (film.genres ?? []).map((g) => g.toLowerCase());
			if (!filters.genres.some((g) => filmGenres.includes(g))) continue;
		}

		if (filters.decades.length > 0) {
			if (!film.year) continue;
			// Label convention: '2020s' / '2010s' / '2000s' for 2000+ eras,
			// '90s' / '80s' / '70s' for 1970s–1990s, 'Pre-1970' for anything
			// earlier. Matches the chip labels in both filter surfaces.
			let decade: string;
			if (film.year < 1970) {
				decade = 'Pre-1970';
			} else if (film.year >= 2000) {
				decade = `${Math.floor(film.year / 10) * 10}s`;
			} else {
				decade = `${Math.floor((film.year % 100) / 10) * 10}s`;
			}
			if (!filters.decades.includes(decade)) continue;
		}

		const existing = map.get(film.id);
		if (existing) existing.screenings.push(s);
		else map.set(film.id, { film: film as NonNullable<S['film']>, screenings: [s] });
	}
	return map;
}
