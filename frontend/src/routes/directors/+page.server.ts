import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export interface DirectorEntry {
	name: string;
	filmCount: number;
	films: string[];
}

interface DirectorsResponse {
	directors: DirectorEntry[];
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

	const data = await apiFetch<DirectorsResponse>('/api/directors?days=14', fetch);

	return { directors: data.directors };
};
