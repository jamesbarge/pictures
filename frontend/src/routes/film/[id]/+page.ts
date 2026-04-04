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

export async function load({ params, fetch }) {
	try {
		const res = await apiGet<FilmDetailResponse>(`/api/films/${params.id}`, { fetch });
		return res;
	} catch (e) {
		throw error(404, 'Film not found');
	}
}
