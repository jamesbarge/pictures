import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

interface ScreeningsResponse {
	screenings: Array<{
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
		cinema: {
			id: string;
			name: string;
			shortName: string | null;
		};
	}>;
	meta: { total: number; startDate: string; endDate: string };
}

interface SleepersResponse {
	/** London date "YYYY-MM-DD" -> that day's pick. */
	picks: Record<
		string,
		{
			filmId: string;
			score: number;
			letterboxdRating: number;
			tmdbVoteCount: number;
			source: 'precomputed' | 'fallback';
		}
	>;
	meta: { from: string; to: string; algoVersion: number; fallbackCount: number };
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

	// Trim initial payload to a 14-day window. Filter UI defaults to a near-term
	// view, and trimming halves transfer size + JSON parse time on the homepage
	// LCP path. Films further out are still reachable via /search and date filters.
	const end = new Date();
	end.setDate(end.getDate() + 14);

	// THE SLEEPER rides along in parallel — one extra round trip on the LCP path
	// would be a real cost, concurrency makes it free.
	//
	// The .catch is on the INDIVIDUAL promise, not around Promise.all:
	// Promise.all rejects on first rejection, so an unguarded sleepers 500 would
	// take the entire homepage to the error page over a decorative marker.
	const [data, sleepers] = await Promise.all([
		apiFetch<ScreeningsResponse>(`/api/screenings?endDate=${end.toISOString()}`, fetch),
		apiFetch<SleepersResponse>('/api/sleepers?days=14', fetch).catch((err) => {
			console.warn('[home] sleepers fetch failed; rendering without marker', err);
			return null;
		})
	]);

	return {
		// The instant this payload was built. The page is ISR-cached, so the
		// browser's clock is routinely ahead of it; the client filters expired
		// screenings against this value until hydration commits so the first
		// client render matches the server's. See `$lib/hydration-clock`.
		renderedAt: Date.now(),
		// THE SLEEPER: London date -> filmId, covering the whole 14-day window
		// rather than just today.
		//
		// Covering the window is what makes ISR staleness a non-issue by
		// construction instead of by mitigation: HTML built at 23:30 (and served
		// stale for up to a day) still holds the correct entry for whatever day
		// the client resolves as first-visible, so nothing on the render path
		// consults a clock. That matters specifically here — a server/client
		// first-render divergence on this page previously stranded every card on
		// the wrong poster (PR #736).
		sleepers: Object.fromEntries(
			Object.entries(sleepers?.picks ?? {}).map(([date, pick]) => [date, pick.filmId])
		) as Record<string, string>,
		screenings: data.screenings.map((s) => ({
			id: s.id,
			datetime: s.datetime,
			format: s.format,
			bookingUrl: s.bookingUrl,
			film: {
				id: s.film.id,
				title: s.film.title,
				year: s.film.year,
				director: s.film.directors?.[0] ?? null,
				genres: s.film.genres ?? [],
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
		}))
	};
};
