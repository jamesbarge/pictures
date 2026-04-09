import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

interface CinemaResponse {
	cinema: {
		id: string;
		name: string;
		shortName: string | null;
		chain: string | null;
		address: { street?: string; area?: string; postcode?: string } | null;
		coordinates: { lat: number; lng: number } | null;
		screens: number | null;
		features: string[];
		programmingFocus: string[];
		website: string | null;
		bookingUrl: string | null;
		imageUrl: string | null;
		description: string | null;
	};
	screenings: Array<{
		id: string;
		datetime: string;
		format: string | null;
		bookingUrl: string;
		screen: string | null;
		film: {
			id: string;
			title: string;
			year: number | null;
			directors: string[];
			runtime: number | null;
			posterUrl: string | null;
		};
		cinema: {
			id: string;
			name: string;
			shortName: string | null;
		};
	}>;
}

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

	let data: CinemaResponse;
	try {
		data = await apiFetch<CinemaResponse>(`/api/cinemas/${params.slug}`, fetch);
	} catch {
		throw error(404, 'Cinema not found');
	}

	return {
		cinema: data.cinema,
		screenings: data.screenings.map((s) => ({
			id: s.id,
			datetime: s.datetime,
			format: s.format,
			bookingUrl: s.bookingUrl,
			screen: s.screen,
			film: {
				id: s.film.id,
				title: s.film.title,
				year: s.film.year,
				directors: s.film.directors,
				runtime: s.film.runtime,
				posterUrl: s.film.posterUrl
			}
		}))
	};
};
