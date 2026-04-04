import { apiGet } from '$lib/api/client';
import type { ScreeningWithDetails } from '$lib/types';

export async function load({ fetch }) {
	// Use London timezone for "tonight" calculation
	const now = new Date();
	const londonDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD format
	const londonHour = parseInt(
		now.toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' })
	);

	// Detect London's UTC offset (e.g. 0 for GMT, 1 for BST) to build correct UTC datetimes
	const londonFormatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/London',
		timeZoneName: 'shortOffset'
	});
	const offsetPart = londonFormatter.formatToParts(now).find((p) => p.type === 'timeZoneName');
	const offsetHours = parseInt(offsetPart?.value?.replace('GMT', '') || '0') || 0;

	// Build proper UTC datetimes from London local date/hour
	const startUtc = new Date(`${londonDate}T${String(londonHour).padStart(2, '0')}:00:00Z`);
	startUtc.setUTCHours(startUtc.getUTCHours() - offsetHours);
	const endUtc = new Date(`${londonDate}T23:59:59Z`);
	endUtc.setUTCHours(endUtc.getUTCHours() - offsetHours);

	const startDate = startUtc.toISOString();
	const endDate = endUtc.toISOString();

	try {
		const res = await apiGet<{ screenings: ScreeningWithDetails[] }>(
			`/api/screenings?startDate=${startDate}&endDate=${endDate}&limit=500`,
			{ fetch }
		);
		return { screenings: res.screenings, dateLabel: 'TONIGHT' };
	} catch (e) {
		console.error('[tonight] Failed to load screenings:', e instanceof Error ? e.message : e);
		return { screenings: [] as ScreeningWithDetails[], dateLabel: 'TONIGHT' };
	}
}
