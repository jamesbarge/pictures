import { env } from '$env/dynamic/private';
import { ApiError } from '$lib/api/client';

// `||` (not `??`) so a present-but-empty env var still falls back — an empty
// API_BASE would silently resolve fetches against the SvelteKit origin and
// surface as misleading per-route 404s.
const API_BASE = env.API_PROXY_TARGET?.trim() || 'https://api.pictures.london';

/**
 * Server-side fetcher for SvelteKit `load` functions. Uses the production
 * absolute base URL because server load runs on Vercel functions where the
 * `/api/*` rewrite isn't in effect. Throws the same `ApiError` shape as the
 * client so any caller's error handling stays uniform regardless of which
 * fetcher it used.
 */
export async function apiFetch<T>(path: string, fetchFn: typeof globalThis.fetch): Promise<T> {
	const res = await fetchFn(`${API_BASE}${path}`);
	if (!res.ok) throw new ApiError(res.status, await res.text());
	return res.json();
}

/** One `/api/screenings` row, typed to the fields the poster pages read. */
export interface ApiScreening {
	id: string;
	datetime: string;
	format: string | null;
	bookingUrl: string;
	film: {
		id: string;
		title: string;
		year: number | null;
		directors: string[];
		genres: string[];
		runtime: number | null;
		posterUrl: string | null;
		isRepertory: boolean;
		letterboxdRating: number | null;
		tmdbPopularity: number | null;
	};
	cinema: { id: string; name: string; shortName: string | null };
}

/** Trim an `/api/screenings` row to what the poster pages (home, tonight, this-weekend) serialize. */
export function slimScreening(s: ApiScreening) {
	return {
		id: s.id,
		datetime: s.datetime,
		format: s.format,
		bookingUrl: s.bookingUrl,
		film: {
			id: s.film.id,
			title: s.film.title,
			year: s.film.year,
			director: s.film.directors?.[0] ?? null,
			runtime: s.film.runtime,
			posterUrl: s.film.posterUrl,
			isRepertory: s.film.isRepertory,
			letterboxdRating: s.film.letterboxdRating,
			tmdbPopularity: s.film.tmdbPopularity ?? null
		},
		cinema: {
			id: s.cinema.id,
			name: s.cinema.name,
			shortName: s.cinema.shortName
		}
	};
}
