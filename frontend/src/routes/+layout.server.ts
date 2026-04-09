import { apiFetch } from '$lib/server/api';
import type { LayoutServerLoad } from './$types';

interface CinemasResponse {
	cinemas: Array<{
		id: string;
		name: string;
		shortName: string | null;
		address: { street?: string; area?: string; postcode?: string } | null;
	}>;
}

export const load: LayoutServerLoad = async ({ fetch }) => {
	const { cinemas } = await apiFetch<CinemasResponse>('/api/cinemas', fetch);

	return {
		cinemas: cinemas.map((c) => ({
			id: c.id,
			name: c.name,
			shortName: c.shortName,
			address: c.address?.area ? { area: c.address.area } : null
		}))
	};
};
