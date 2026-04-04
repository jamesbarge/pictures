import { apiGet } from '$lib/api/client';

interface ScreeningWithFilm {
	film: {
		id: string;
		title: string;
		directors: string[];
	} | null;
}

export interface DirectorEntry {
	name: string;
	filmCount: number;
	films: string[];
}

export async function load({ fetch }) {
	try {
		const res = await apiGet<{ screenings: ScreeningWithFilm[] }>('/api/screenings?limit=500', { fetch });

		const directorMap = new Map<string, DirectorEntry>();

		for (const s of res.screenings) {
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

		const directors = [...directorMap.values()]
			.sort((a, b) => b.filmCount - a.filmCount);

		return { directors };
	} catch (e) {
		console.error('[directors] Failed to load directors:', e instanceof Error ? e.message : e);
		return { directors: [] as DirectorEntry[] };
	}
}
