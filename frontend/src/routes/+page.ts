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

interface PaginatedResponse extends ScreeningsResponse {
	meta: ScreeningsResponse['meta'] & {
		cursor?: string;
		hasMore?: boolean;
		limit?: number;
	};
}

export async function load({ fetch }) {
	try {
		// Fetch all screenings using cursor pagination (API caps at 500 per page)
		// This ensures we get a full month of data, not just 12 days
		const allScreenings: ScreeningsResponse['screenings'] = [];
		let cursor: string | undefined;
		let meta: ScreeningsResponse['meta'] = { total: 0, startDate: '', endDate: '' };
		const PAGE_SIZE = 500;
		const MAX_PAGES = 30; // Safety limit: 30 * 500 = 15,000 max

		// Request 30 days of screenings (API defaults to 14)
		const endDate = new Date();
		endDate.setDate(endDate.getDate() + 30);
		const endDateStr = endDate.toISOString();

		for (let page = 0; page < MAX_PAGES; page++) {
			const params = new URLSearchParams({ limit: String(PAGE_SIZE), endDate: endDateStr });
			if (cursor) params.set('cursor', cursor);

			const res = await apiGet<PaginatedResponse>(`/api/screenings?${params}`, { fetch });
			allScreenings.push(...res.screenings);
			meta = res.meta;

			if (!res.meta.hasMore || !res.meta.cursor) break;
			cursor = res.meta.cursor;
		}

		return { screenings: allScreenings, meta };
	} catch (e) {
		console.error('[home] Failed to load screenings:', e instanceof Error ? e.message : e);
		return { screenings: [], meta: { total: 0, startDate: '', endDate: '' } };
	}
}
