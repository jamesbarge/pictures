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
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const end = endOfDay(addDays(now, 14));

	const data = await apiFetch<ScreeningsResponse>(
		`/api/screenings?startDate=${now.toISOString()}&endDate=${end.toISOString()}&limit=3000`,
		fetch
	);

	const directorMap = new Map<string, DirectorEntry>();

	for (const s of data.screenings) {
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
