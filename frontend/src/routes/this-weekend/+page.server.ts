import { apiFetch } from '$lib/server/api';
import {
	addDaysToDateString,
	londonDateTime,
	londonWeekendRange
} from '$lib/london-date';
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
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const { from: startDate, to: endDate } = londonWeekendRange(now);
	const start = londonDateTime(startDate);
	const end = new Date(londonDateTime(addDaysToDateString(endDate, 1)).getTime() - 1);

	const data = await apiFetch<ScreeningsResponse>(
		`/api/screenings?startDate=${start.toISOString()}&endDate=${end.toISOString()}&limit=200`,
		fetch
	);

	return {
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
		})),
		startDate,
		endDate
	};
};
