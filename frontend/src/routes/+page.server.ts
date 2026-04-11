import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

interface ScreeningsResponse {
	screenings: Array<{
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
			isRepertory: boolean;
		};
		cinema: {
			id: string;
			name: string;
			shortName: string | null;
		};
	}>;
	meta: { total: number; startDate: string; endDate: string };
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

	const end = new Date();
	end.setDate(end.getDate() + 30);
	const data = await apiFetch<ScreeningsResponse>(
		`/api/screenings?endDate=${end.toISOString()}`,
		fetch
	);

	return {
		screenings: data.screenings.map((s) => ({
			id: s.id,
			datetime: s.datetime,
			format: s.format,
			bookingUrl: s.bookingUrl,
			film: {
				id: s.film.id,
				title: s.film.title,
				year: s.film.year,
				director: s.film.directors?.[0] ?? null,
				runtime: s.film.runtime,
				posterUrl: s.film.posterUrl,
				isRepertory: s.film.isRepertory
			},
			cinema: {
				id: s.cinema.id,
				name: s.cinema.name,
				shortName: s.cinema.shortName
			}
		})),
		meta: {
			total: data.meta.total,
			startDate: data.meta.startDate,
			endDate: data.meta.endDate
		}
	};
};
