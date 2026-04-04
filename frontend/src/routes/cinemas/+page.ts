import { apiGet } from '$lib/api/client';
import type { Cinema } from '$lib/types';

export async function load({ fetch }) {
	try {
		const res = await apiGet<{ cinemas: Cinema[] }>('/api/cinemas', { fetch });
		return { cinemas: res.cinemas };
	} catch (e) {
		console.error('[cinemas] Failed to load cinemas:', e instanceof Error ? e.message : e);
		return { cinemas: [] };
	}
}
