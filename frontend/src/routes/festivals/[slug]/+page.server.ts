import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFestivalBySlug } from '$lib/server/repositories';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const festival = await getFestivalBySlug(params.slug);

	if (!festival) {
		throw error(404, 'Festival not found');
	}

	return { festival, screenings: festival.screenings };
};
