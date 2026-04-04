import { apiGet } from '$lib/api/client';
import type { ScreeningWithDetails } from '$lib/types';

export async function load({ fetch, parent }) {
	const { cinemas } = await parent();

	// Fetch screenings for the next 3 days
	const now = new Date();
	const londonDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

	const endDate = new Date(now);
	endDate.setDate(endDate.getDate() + 3);
	const endDateStr = endDate.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

	try {
		const res = await apiGet<{ screenings: ScreeningWithDetails[] }>(
			`/api/screenings?startDate=${londonDate}&endDate=${endDateStr}&limit=500`,
			{ fetch }
		);
		return { screenings: res.screenings, cinemas };
	} catch (e) {
		console.error('[reachable] Failed to load screenings:', e instanceof Error ? e.message : e);
		return { screenings: [] as ScreeningWithDetails[], cinemas };
	}
}
