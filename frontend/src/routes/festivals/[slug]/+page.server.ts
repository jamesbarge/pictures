import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

interface FestivalResponse {
	festival: {
		id: string;
		name: string;
		slug: string;
		description: string | null;
		startDate: string;
		endDate: string;
		status: string;
	};
	screenings?: Array<{
		id: string;
		datetime: string;
		format: string | null;
		bookingUrl: string;
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

	let data: FestivalResponse;
	try {
		data = await apiFetch<FestivalResponse>(`/api/festivals/${params.slug}`, fetch);
	} catch {
		throw error(404, 'Festival not found');
	}

	return {
		festival: data.festival,
		screenings: (data.screenings ?? []).map((s) => ({
			id: s.id,
			datetime: s.datetime,
			format: s.format,
			bookingUrl: s.bookingUrl,
			film: { ...s.film, genres: [] as string[] },
			cinema: s.cinema
		}))
	};
};
