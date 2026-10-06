import { apiFetch } from '$lib/server/api';
import type { Config } from '@sveltejs/adapter-vercel';
import type { PageServerLoad } from './$types';

export const config: Config = {
	isr: { expiration: 86400, allowQuery: [] }
};

interface FestivalsResponse {
	festivals: Array<{
		id: string;
		name: string;
		slug: string;
		description: string | null;
		startDate: string;
		endDate: string;
		venues: string[];
	}>;
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' });
	const { festivals } = await apiFetch<FestivalsResponse>('/api/festivals', fetch);
	return {
		festivals: festivals.map((festival) => ({
			id: festival.id,
			slug: festival.slug,
			name: festival.name,
			startDate: festival.startDate,
			endDate: festival.endDate,
			venue: festival.venues[0] ?? null,
			description: festival.description
		}))
	};
};
