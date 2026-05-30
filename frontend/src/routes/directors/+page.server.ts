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

	// Trim the serialized payload to what the page renders: the component shows
	// films.slice(0, 3) plus a films.length > 3 ellipsis. Keeping 4 titles
	// preserves the exact ellipsis trigger while dropping the 4th-plus strings.
	const directors = data.directors.map((director) => ({
		name: director.name,
		filmCount: director.filmCount,
		films: director.films.slice(0, 4)
	}));

	return { directors };
};
