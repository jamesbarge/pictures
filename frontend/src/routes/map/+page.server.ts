import { getActiveCinemas } from '$lib/server/repositories';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 86400, allowQuery: [] }
};

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' });
	const cinemas = await getActiveCinemas();
	return { cinemas };
};
