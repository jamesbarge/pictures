import { apiGet } from '$lib/api/client';
import type { ScreeningWithDetails } from '$lib/types';

export async function load({ fetch }) {
	// Use London timezone for weekend calculation
	const now = new Date();
	const londonDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD

	// Get London day of week (0=Sun, 6=Sat) using a reliable method
	const londonParts = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short', timeZone: 'Europe/London'
	}).format(now);
	const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	const day = dayMap[londonParts] ?? now.getDay();

	// Find next Saturday (or today if already Saturday)
	const satOffset = day === 0 ? 6 : day === 6 ? 0 : 6 - day;

	// Build date strings by adding days to the London date
	const londonDate = new Date(londonDateStr + 'T12:00:00Z'); // noon UTC to avoid DST edge
	const sat = new Date(londonDate);
	sat.setUTCDate(londonDate.getUTCDate() + satOffset);
	const sun = new Date(sat);
	sun.setUTCDate(sat.getUTCDate() + 1);

	const startDate = sat.toISOString().split('T')[0];
	const endDate = sun.toISOString().split('T')[0];

	try {
		const res = await apiGet<{ screenings: ScreeningWithDetails[] }>(`/api/screenings?startDate=${startDate}T00:00:00Z&endDate=${endDate}T23:59:59Z&limit=500`, { fetch });
		return {
			screenings: res.screenings,
			startDate,
			endDate
		};
	} catch (e) {
		console.error('[weekend] Failed to load screenings:', e instanceof Error ? e.message : e);
		return { screenings: [], startDate, endDate };
	}
}
