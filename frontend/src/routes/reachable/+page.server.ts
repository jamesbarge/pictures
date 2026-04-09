import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';
import type { Cinema } from '$lib/types';

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
		};
		cinema: {
			id: string;
			name: string;
			shortName: string | null;
		};
	}>;
}

interface CinemasResponse {
	cinemas: Cinema[];
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const endDate = new Date(now);
	endDate.setDate(endDate.getDate() + 3);

	const [screeningsData, cinemasData] = await Promise.all([
		apiFetch<ScreeningsResponse>(
			`/api/screenings?startDate=${now.toISOString()}&endDate=${endDate.toISOString()}&limit=200`,
			fetch
		),
		apiFetch<CinemasResponse>('/api/cinemas', fetch)
	]);

	return {
		cinemas: cinemasData.cinemas,
		screenings: screeningsData.screenings.map((s) => ({
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
				isRepertory: s.film.isRepertory
			},
			cinema: {
				id: s.cinema.id,
				name: s.cinema.name,
				shortName: s.cinema.shortName
			}
		}))
	};
};
