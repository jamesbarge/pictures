import { apiFetch, type ApiScreening } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

// Cinemas come from the root layout load.
export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const endDate = new Date(now);
	endDate.setDate(endDate.getDate() + 3);

	const screeningsData = await apiFetch<{ screenings: ApiScreening[] }>(
		`/api/screenings?startDate=${now.toISOString()}&endDate=${endDate.toISOString()}&limit=200`,
		fetch
	);

	return {
		screenings: screeningsData.screenings.map((s) => ({
			id: s.id,
			datetime: s.datetime,
			format: s.format,
			bookingUrl: s.bookingUrl,
			film: {
				id: s.film.id,
				title: s.film.title,
				year: s.film.year,
				runtime: s.film.runtime,
				posterUrl: s.film.posterUrl
			},
			cinema: {
				id: s.cinema.id,
				name: s.cinema.name,
				shortName: s.cinema.shortName
			}
		}))
	};
};
