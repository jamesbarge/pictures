import { apiGet } from '$lib/api/client';

interface ScreeningsResponse {
	screenings: Array<{
		id: string;
		filmId: string;
		cinemaId: string;
		datetime: string;
		format: string | null;
		bookingUrl: string;
		isSoldOut: boolean;
		film: {
			id: string;
			title: string;
			year: number | null;
			directors: string[];
			runtime: number | null;
			posterUrl: string | null;
			isRepertory: boolean;
			genres: string[];
		};
		cinema: {
			id: string;
			name: string;
			shortName: string | null;
		};
	}>;
	meta: {
		total: number;
		startDate: string;
		endDate: string;
	};
}

export async function load({ fetch }) {
	try {
		const res = await apiGet<ScreeningsResponse>('/api/screenings', { fetch });
		return { screenings: res.screenings, meta: res.meta };
	} catch (e) {
		console.error('[home] Failed to load screenings:', e instanceof Error ? e.message : e);
		return { screenings: [], meta: { total: 0, startDate: '', endDate: '' } };
	}
}
