import { apiGet } from '$lib/api/client';
import { error } from '@sveltejs/kit';
import type { Cinema } from '$lib/types';

interface CinemaScreening {
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
}

interface CinemaDetailResponse {
	cinema: Cinema;
	screenings: CinemaScreening[];
}

export async function load({ params, fetch }) {
	try {
		const [cinemaRes, screeningsRes] = await Promise.all([
			apiGet<{ cinemas: Cinema[] }>(`/api/cinemas?id=${params.slug}`, { fetch }),
			apiGet<{ screenings: CinemaScreening[] }>(`/api/screenings?cinemas=${params.slug}&limit=200`, { fetch })
		]);

		const cinema = cinemaRes.cinemas?.[0];
		if (!cinema) throw new Error('Not found');

		return {
			cinema,
			screenings: screeningsRes.screenings ?? []
		};
	} catch (e) {
		console.error('[cinema-detail] Failed to load cinema:', e instanceof Error ? e.message : e);
		throw error(404, 'Cinema not found');
	}
}
