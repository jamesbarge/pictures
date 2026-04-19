import { apiGet } from '$lib/api/client';
import { error } from '@sveltejs/kit';
import type { ScreeningWithDetails } from '$lib/types';

export interface FestivalDetail {
	id: string;
	slug: string;
	name: string;
	startDate: string | null;
	endDate: string | null;
	venue: string | null;
	description: string | null;
}

export async function load({ params, fetch }) {
	try {
		const res = await apiGet<{ festival: FestivalDetail; screenings: ScreeningWithDetails[] }>(`/api/festivals/${params.slug}`, { fetch });
		return res;
	} catch (e) {
		console.error('[festival-detail] Failed to load festival:', e instanceof Error ? e.message : e);
		throw error(404, 'Festival not found');
	}
}
