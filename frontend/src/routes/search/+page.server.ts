import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 1800, allowQuery: ['q'] }
};

interface SearchResponse {
	results: Array<{
		id: string;
		title: string;
		year: number | null;
		directors: string[];
		posterUrl: string | null;
	}>;
	cinemas: Array<{
		id: string;
		name: string;
		shortName: string | null;
		address: string | null;
	}>;
}

export const load: PageServerLoad = async ({ url, fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=1800, stale-while-revalidate=7200' });
	const q = url.searchParams.get('q')?.trim();

	if (!q) {
		return { results: [], cinemas: [], query: '' };
	}

	const data = await apiFetch<SearchResponse>(
		`/api/films/search?q=${encodeURIComponent(q)}`,
		fetch
	);

	return {
		results: data.results,
		cinemas: data.cinemas.map((c) => ({
			id: c.id,
			name: c.name,
			shortName: c.shortName,
			area: c.address
		})),
		query: q
	};
};
