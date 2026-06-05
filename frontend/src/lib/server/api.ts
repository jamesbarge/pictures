import { env } from '$env/dynamic/private';
import { ApiError } from '$lib/api/client';

// `||` (not `??`) so a present-but-empty env var still falls back — an empty
// API_BASE would silently resolve fetches against the SvelteKit origin and
// surface as misleading per-route 404s.
const API_BASE = env.API_PROXY_TARGET?.trim() || 'https://api.pictures.london';

/**
 * Server-side fetcher for SvelteKit `load` functions. Uses the production
 * absolute base URL because server load runs on Vercel functions where the
 * `/api/*` rewrite isn't in effect. Throws the same `ApiError` shape as the
 * client so any caller's error handling stays uniform regardless of which
 * fetcher it used.
 */
export async function apiFetch<T>(path: string, fetchFn: typeof globalThis.fetch): Promise<T> {
	const res = await fetchFn(`${API_BASE}${path}`);
	if (!res.ok) throw new ApiError(res.status, await res.text());
	return res.json();
}
