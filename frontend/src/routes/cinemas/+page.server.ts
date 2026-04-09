import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';
import type { Cinema } from '$lib/types';

export const config: Config = {
	isr: { expiration: 86400, allowQuery: [] }
};

interface CinemasResponse {
	cinemas: Cinema[];
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' });
	const { cinemas } = await apiFetch<CinemasResponse>('/api/cinemas', fetch);
	return { cinemas };
};
