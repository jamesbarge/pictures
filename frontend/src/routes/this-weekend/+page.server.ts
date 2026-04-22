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
	const londonDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

	const londonParts = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		timeZone: 'Europe/London'
	}).format(now);
	const dayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6
	};
	const day = dayMap[londonParts] ?? now.getDay();

	const satOffset = day === 0 ? 6 : day === 6 ? 0 : 6 - day;

	const londonDate = new Date(londonDateStr + 'T12:00:00Z');
	const sat = new Date(londonDate);
	sat.setUTCDate(londonDate.getUTCDate() + satOffset);
	const sun = new Date(sat);
	sun.setUTCDate(sat.getUTCDate() + 1);

	const startDate = sat.toISOString().split('T')[0];
	const endDate = sun.toISOString().split('T')[0];

	const data = await apiFetch<ScreeningsResponse>(
		`/api/screenings?startDate=${startDate}T00:00:00Z&endDate=${endDate}T23:59:59Z&limit=200`,
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
