import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 900, allowQuery: [] }
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
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=900, stale-while-revalidate=3600' });
	const now = new Date();
	const londonDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
	const londonHour = parseInt(
		now.toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' })
	);

	// Detect London's UTC offset to build correct UTC datetimes
	const londonFormatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/London',
		timeZoneName: 'shortOffset'
	});
	const offsetPart = londonFormatter.formatToParts(now).find((p) => p.type === 'timeZoneName');
	const offsetHours = parseInt(offsetPart?.value?.replace('GMT', '') || '0') || 0;

	const startUtc = new Date(`${londonDate}T${String(londonHour).padStart(2, '0')}:00:00Z`);
	startUtc.setUTCHours(startUtc.getUTCHours() - offsetHours);
	const endUtc = new Date(`${londonDate}T23:59:59Z`);
	endUtc.setUTCHours(endUtc.getUTCHours() - offsetHours);

	const data = await apiFetch<ScreeningsResponse>(
		`/api/screenings?startDate=${startUtc.toISOString()}&endDate=${endUtc.toISOString()}&limit=200`,
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
		dateLabel: 'TONIGHT'
	};
};
