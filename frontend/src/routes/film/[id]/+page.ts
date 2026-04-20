import { apiGet } from '$lib/api/client';
import { error } from '@sveltejs/kit';
import type { Film, Screening } from '$lib/types';

interface FilmDetailResponse {
	film: Film;
	screenings: Array<Screening & {
		cinema: { id: string; name: string; shortName: string | null };
	}>;
	meta: { screeningCount: number };
}

export interface SimilarFilm {
	id: string;
	title: string;
	year: number | null;
	posterUrl: string | null;
}

interface SimilarResponse {
	similar: SimilarFilm[];
}

export async function load({ params, fetch }) {
	try {
		// Fetch detail + similar in parallel. Similar is best-effort: a failure
		// (network, backend down, TMDB quota) just hides the rail — we never
		// break the detail page over it.
		const [detail, similar] = await Promise.all([
			apiGet<FilmDetailResponse>(`/api/films/${params.id}`, { fetch }),
			apiGet<SimilarResponse>(`/api/films/${params.id}/similar`, { fetch }).catch(() => ({ similar: [] as SimilarFilm[] }))
		]);
		return { ...detail, similar: similar.similar };
	} catch (e) {
		throw error(404, 'Film not found');
	}
}
