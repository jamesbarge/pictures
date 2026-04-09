import { apiFetch } from '$lib/server/api';
import { endOfDay, addDays } from 'date-fns';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export interface DirectorEntry {
	name: string;
	filmCount: number;
	films: string[];
}

interface ScreeningsResponse {
	screenings: Array<{
		film: {
			id: string;
			title: string;
			directors: string[];
		};
	}>;
	meta: {
		cursor: string | null;
		hasMore: boolean;
	};
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const end = endOfDay(addDays(now, 14));

	// Fetch all screenings using cursor pagination (API max 500 per request)
	const allScreenings: ScreeningsResponse['screenings'] = [];
	let cursor: string | null = null;
	let hasMore = true;

	while (hasMore) {
		const params = new URLSearchParams({
			startDate: now.toISOString(),
			endDate: end.toISOString(),
			limit: '500'
		});
		if (cursor) params.set('cursor', cursor);

		const data = await apiFetch<ScreeningsResponse>(
			`/api/screenings?${params}`,
			fetch
		);
		allScreenings.push(...data.screenings);
		cursor = data.meta.cursor;
		hasMore = data.meta.hasMore;
	}

	const directorMap = new Map<string, DirectorEntry>();

	for (const s of allScreenings) {
		if (!s.film?.directors) continue;
		for (const director of s.film.directors) {
			const existing = directorMap.get(director);
			if (existing) {
				if (!existing.films.includes(s.film.title)) {
					existing.films.push(s.film.title);
					existing.filmCount++;
				}
			} else {
				directorMap.set(director, { name: director, filmCount: 1, films: [s.film.title] });
			}
		}
	}

	const directors = [...directorMap.values()].sort((a, b) => b.filmCount - a.filmCount);

	return { directors };
};
