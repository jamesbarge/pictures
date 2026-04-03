import { apiGet } from '$lib/api/client';
import type { ScreeningWithDetails } from '$lib/types';

export async function load({ fetch }) {
	// Use London timezone for "tonight" calculation
	const now = new Date();
	const londonDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD format
	const londonHour = parseInt(
		now.toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' })
	);

	try {
		const res = await apiGet<{ screenings: ScreeningWithDetails[] }>(
			`/api/screenings?startDate=${londonDate}T${String(londonHour).padStart(2, '0')}:00:00Z&endDate=${londonDate}T23:59:59Z&limit=500`,
			{ fetch }
		);
		return { screenings: res.screenings, dateLabel: 'TONIGHT' };
	} catch (e) {
		console.error('[tonight] Failed to load screenings:', e instanceof Error ? e.message : e);
		return { screenings: [] as ScreeningWithDetails[], dateLabel: 'TONIGHT' };
	}
}
