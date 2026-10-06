import { apiFetch, slimScreening, type ApiScreening } from '$lib/server/api';
import {
	addDaysToDateString,
	londonDateTime,
	londonWeekendRange
} from '$lib/london-date';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 3600, allowQuery: [] }
};

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' });
	const now = new Date();
	const { from: startDate, to: endDate } = londonWeekendRange(now);
	const start = londonDateTime(startDate);
	const end = new Date(londonDateTime(addDaysToDateString(endDate, 1)).getTime() - 1);

	const data = await apiFetch<{ screenings: ApiScreening[] }>(
		`/api/screenings?startDate=${start.toISOString()}&endDate=${end.toISOString()}&limit=200`,
		fetch
	);

	return {
		// Instant this payload was built — the page is ISR-cached, so the client
		// filters against it until hydration commits. See `$lib/hydration-clock`.
		renderedAt: Date.now(),
		screenings: data.screenings.map(slimScreening)
	};
};
