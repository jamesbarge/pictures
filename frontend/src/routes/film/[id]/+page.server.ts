import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

interface FilmResponse {
	film: {
		id: string;
		title: string;
		originalTitle: string | null;
		year: number | null;
		directors: string[];
		cast: Array<{ name: string; character?: string }> | null;
		runtime: number | null;
		posterUrl: string | null;
		synopsis: string | null;
		tagline: string | null;
		genres: string[];
		countries: string[];
		certification: string | null;
		isRepertory: boolean;
		contentType: string | null;
		tmdbId: number | null;
		imdbId: string | null;
		letterboxdUrl: string | null;
		letterboxdRating: number | null;
		tmdbRating: number | null;
		createdAt: string;
		updatedAt: string;
	};
	screenings: Array<{
		id: string;
		datetime: string;
		format: string | null;
		screen: string | null;
		bookingUrl: string;
		cinema: {
			id: string;
			name: string;
			shortName: string | null;
		};
	}>;
	meta: { screeningCount: number };
}

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

	let data: FilmResponse;
	try {
		data = await apiFetch<FilmResponse>(`/api/films/${params.id}`, fetch);
	} catch {
		throw error(404, 'Film not found');
	}

	return {
		film: data.film,
		screenings: data.screenings,
		meta: data.meta
	};
};
