/**
 * Shared view-model shapes for the calendar card components
 * (FilmCard, DesktopHybridCard, MobileFilmRow).
 *
 * Each card historically declared its own near-identical inline `Film` and
 * `Screening` interfaces, drifting field-by-field over time. Consolidating
 * here gives a single source of truth and a single adapter (`toCardScreening`)
 * that every route can reuse instead of inline `.map()` closures.
 *
 * These are intentionally distinct from the canonical `Film` / `Screening`
 * types in `$lib/types/*` — those describe the API contract, this describes
 * the denormalised, optional-everywhere view-model the cards actually render.
 */

export interface CardFilm {
	id: string | number;
	title: string;
	year?: number | null;
	director?: string | null;
	runtime?: number | null;
	country?: string | null;
	certification?: string | null;
	genres?: string[] | null;
	posterUrl?: string | null;
	tmdbId?: number | null;
}

export interface CardScreening {
	id: string;
	datetime: string;
	cinemaName: string;
	cinemaSlug?: string;
	format?: string | null;
	bookingUrl?: string;
}

/**
 * Minimal source shape `toCardScreening` accepts. Each route's
 * `data.screenings[number]` is a superset of this (extra ratings/popularity
 * fields, etc.) — TypeScript's structural typing accepts the widened input.
 */
export interface SourceScreening {
	id: string;
	datetime: string;
	format?: string | null;
	bookingUrl?: string;
	cinema: { id: string; name: string; shortName?: string | null } | null;
}

/**
 * Adapt a raw API screening to the shape every card expects. The fallback
 * `'Unknown'` cinema name matches every prior inline implementation — if the
 * upstream schema ever stops nulling `cinema`, the fallback becomes dead but
 * harmless.
 */
export function toCardScreening(s: SourceScreening): CardScreening {
	return {
		id: s.id,
		datetime: s.datetime,
		cinemaName: s.cinema?.name ?? 'Unknown',
		cinemaSlug: s.cinema?.id ?? '',
		format: s.format ?? null,
		bookingUrl: s.bookingUrl
	};
}

/**
 * Display label for a screening format. `unknown` and `dcp` are the default
 * projection values most venues report — they carry no signal, so they render
 * as nothing rather than as noise on every row. Underscores become spaces
 * (`SEVENTY_MM` → `SEVENTY MM`), output is uppercased.
 */
export function formatLabel(format: string | null | undefined): string {
	if (!format || format === 'unknown' || format === 'dcp') return '';
	return format.toUpperCase().replace('_', ' ');
}
