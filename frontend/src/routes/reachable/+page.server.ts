import { getScreeningsWithCursor, getActiveCinemas } from '$lib/server/repositories';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const endDate = new Date(now);
	endDate.setDate(endDate.getDate() + 3);

	const [{ screenings }, cinemas] = await Promise.all([
		getScreeningsWithCursor({ startDate: now, endDate }, undefined, 500),
		getActiveCinemas()
	]);

	return {
		cinemas,
		screenings: screenings.map((s) => ({
			id: s.id,
			filmId: s.film.id,
			cinemaId: s.cinema.id,
			datetime: s.datetime.toISOString(),
			format: s.format,
			bookingUrl: s.bookingUrl,
			isSoldOut: false,
			film: {
				id: s.film.id,
				title: s.film.title,
				year: s.film.year,
				directors: s.film.directors,
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
