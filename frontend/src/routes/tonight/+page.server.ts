import { apiFetch, slimScreening, type ApiScreening } from '$lib/server/api';
import {
	addDaysToDateString,
	londonClock,
	londonDateString,
	londonDateTime
} from '$lib/london-date';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 900, allowQuery: [] }
};

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=900, stale-while-revalidate=3600' });
	const now = new Date();
	const londonDate = londonDateString(now);
	const startUtc = londonDateTime(londonDate, londonClock(now).hour);
	const endUtc = new Date(londonDateTime(addDaysToDateString(londonDate, 1)).getTime() - 1);

	const data = await apiFetch<{ screenings: ApiScreening[] }>(
		`/api/screenings?startDate=${startUtc.toISOString()}&endDate=${endUtc.toISOString()}&limit=200`,
		fetch
	);

	return {
		// Instant this payload was built — the page is ISR-cached, so the client
		// filters against it until hydration commits. See `$lib/hydration-clock`.
		renderedAt: Date.now(),
		screenings: data.screenings.map(slimScreening)
	};
};
