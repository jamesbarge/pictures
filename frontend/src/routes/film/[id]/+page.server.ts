import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFilmById, getUpcomingScreeningsForFilm } from '$lib/server/repositories';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const [film, filmScreenings] = await Promise.all([
		getFilmById(params.id),
		getUpcomingScreeningsForFilm(params.id)
	]);

	if (!film) {
		throw error(404, 'Film not found');
	}

	return {
		film: {
			...film,
			createdAt: (film.createdAt as unknown as Date).toISOString(),
			updatedAt: (film.updatedAt as unknown as Date).toISOString()
		},
		screenings: filmScreenings.map((s) => ({
			...s,
			datetime: s.datetime.toISOString()
		})),
		meta: { screeningCount: filmScreenings.length }
	};
};
