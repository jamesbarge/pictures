import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCinemaById, getScreeningsWithCursor } from '$lib/server/repositories';
import { endOfDay, addDays } from 'date-fns';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const [cinema, screeningsResult] = await Promise.all([
		getCinemaById(params.slug),
		getScreeningsWithCursor(
			{
				startDate: new Date(),
				endDate: endOfDay(addDays(new Date(), 30)),
				cinemaIds: [params.slug]
			},
			undefined,
			200
		)
	]);

	if (!cinema) {
		throw error(404, 'Cinema not found');
	}

	return {
		cinema,
		screenings: screeningsResult.screenings.map((s) => ({
			id: s.id,
			datetime: s.datetime.toISOString(),
			format: s.format,
			bookingUrl: s.bookingUrl,
			screen: s.screen,
			film: {
				id: s.film.id,
				title: s.film.title,
				year: s.film.year,
				directors: s.film.directors,
				runtime: s.film.runtime,
				posterUrl: s.film.posterUrl
			}
		}))
	};
};
