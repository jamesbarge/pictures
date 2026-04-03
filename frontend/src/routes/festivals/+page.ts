import { apiGet } from '$lib/api/client';

export interface FestivalSummary {
	id: string;
	slug: string;
	name: string;
	startDate: string | null;
	endDate: string | null;
	venue: string | null;
	description: string | null;
}

export async function load({ fetch }) {
	try {
		const res = await apiGet<{ festivals: FestivalSummary[] }>('/api/festivals', { fetch });
		return { festivals: res.festivals ?? [] };
	} catch (e) {
		console.error('[festivals] Failed to load festivals:', e instanceof Error ? e.message : e);
		return { festivals: [] as FestivalSummary[] };
	}
}
