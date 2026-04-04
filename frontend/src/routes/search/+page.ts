import { apiGet } from '$lib/api/client';

interface SearchResult {
	id: string;
	title: string;
	year: number | null;
	directors: string[];
	posterUrl: string | null;
}

interface SearchResponse {
	results: SearchResult[];
	cinemas: { id: string; name: string; area: string }[];
}

export async function load({ url, fetch }) {
	const q = url.searchParams.get('q')?.trim();

	if (!q) {
		return { results: [], cinemas: [], query: '' };
	}

	try {
		const res = await apiGet<SearchResponse>(`/api/films/search?q=${encodeURIComponent(q)}`, { fetch });
		return {
			results: res.results,
			cinemas: res.cinemas ?? [],
			query: q
		};
	} catch (e) {
		console.error('[search] Failed:', e instanceof Error ? e.message : e);
		return { results: [], cinemas: [], query: q };
	}
}
