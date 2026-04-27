import { apiFetch } from '$lib/server/api';
import type { LayoutServerLoad } from './$types';

interface CinemasResponse {
	cinemas: Array<{
		id: string;
		name: string;
		shortName: string | null;
		address: { street?: string; area?: string; postcode?: string } | null;
		coordinates: { lat: number; lng: number } | null;
	}>;
}

// Cinema list is near-static (changes ~weekly). We don't call `setHeaders`
// here because each route's own `+page.server.ts` already does — SvelteKit
// throws on duplicate `cache-control` between layout and page. Caching of the
// layout response is therefore driven by the page-level ISR config; upstream
// `/api/cinemas` is cached by the API itself plus Vercel's fetch cache.
export const load: LayoutServerLoad = async ({ fetch }) => {
	const { cinemas } = await apiFetch<CinemasResponse>('/api/cinemas', fetch);

	return {
		cinemas: cinemas.map((c) => ({
			id: c.id,
			name: c.name,
			shortName: c.shortName,
			address: c.address?.area ? { area: c.address.area } : null,
			coordinates: c.coordinates
		}))
	};
};
