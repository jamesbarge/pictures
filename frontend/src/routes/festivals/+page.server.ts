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
		shortName: string | null;
		year: number;
		description: string | null;
		websiteUrl: string | null;
		logoUrl: string | null;
		startDate: string;
		endDate: string;
		genreFocus: string[];
		venues: string[];
		isActive: boolean;
		status: string;
		ticketStatus: string | null;
	}>;
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' });
	const { festivals } = await apiFetch<FestivalsResponse>('/api/festivals', fetch);
	return { festivals };
};
