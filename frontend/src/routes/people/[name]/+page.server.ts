import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

interface PersonFilm {
	id: string;
	title: string;
	year: number | null;
	directors: string[];
	posterUrl: string | null;
	runtime: number | null;
	genres: string[] | null;
	isDirector: boolean;
	isCast: boolean;
	nextScreeningAt: string | null;
	screeningCount: number;
}

interface PersonResponse {
	person: { name: string; isDirector: boolean; isCast: boolean; filmCount: number };
	films: PersonFilm[];
}

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

	let data: PersonResponse;
	try {
		data = await apiFetch<PersonResponse>(
			`/api/people/${encodeURIComponent(params.name)}`,
			fetch
		);
	} catch {
		throw error(404, 'Nobody by that name is showing in London right now');
	}

	return {
		person: data.person,
		directorFilms: data.films.filter((f) => f.isDirector),
		// Cast credits the person did NOT also direct (avoids double-listing).
		actorFilms: data.films.filter((f) => f.isCast && !f.isDirector)
	};
};
