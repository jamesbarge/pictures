const API_BASE = 'https://api.pictures.london';

export async function apiFetch<T>(path: string, fetchFn: typeof globalThis.fetch): Promise<T> {
	const res = await fetchFn(`${API_BASE}${path}`);
	if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
	return res.json();
}
