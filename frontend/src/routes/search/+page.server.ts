import type { PageServerLoad } from './$types';
import { searchFilmsAndCinemas } from '$lib/server/repositories';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 1800, allowQuery: ['q'] }
};

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=1800, stale-while-revalidate=7200' });
	const q = url.searchParams.get('q')?.trim();

	if (!q) {
		return { results: [], cinemas: [], query: '' };
	}

	const { results, cinemas } = await searchFilmsAndCinemas(q);
	return { results, cinemas, query: q };
};
