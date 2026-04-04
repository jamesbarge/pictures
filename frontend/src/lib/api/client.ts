// In dev: Vite proxy handles /api → localhost:3000
// In production: Vercel rewrites /api/* → pictures.london/api/*
// So API_BASE is always empty — relative /api/ paths work everywhere
const API_BASE = '';

export class ApiError extends Error {
	constructor(
		public status: number,
		public body: string
	) {
		super(`API error ${status}: ${body}`);
		this.name = 'ApiError';
	}
}

export async function apiGet<T>(
	path: string,
	opts?: { fetch?: typeof fetch; token?: string }
): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (opts?.token) {
		headers['Authorization'] = `Bearer ${opts.token}`;
	}

	const res = await f(`${API_BASE}${path}`, { headers });
	if (!res.ok) {
		throw new ApiError(res.status, await res.text());
	}
	return res.json();
}

export async function apiPost<T>(
	path: string,
	body: unknown,
	opts?: { fetch?: typeof fetch; token?: string }
): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (opts?.token) {
		headers['Authorization'] = `Bearer ${opts.token}`;
	}

	const res = await f(`${API_BASE}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new ApiError(res.status, await res.text());
	}
	return res.json();
}

export async function apiPut<T>(
	path: string,
	body: unknown,
	opts?: { fetch?: typeof fetch; token?: string }
): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (opts?.token) {
		headers['Authorization'] = `Bearer ${opts.token}`;
	}

	const res = await f(`${API_BASE}${path}`, {
		method: 'PUT',
		headers,
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new ApiError(res.status, await res.text());
	}
	return res.json();
}

export async function apiDelete(
	path: string,
	opts?: { fetch?: typeof fetch; token?: string }
): Promise<void> {
	const f = opts?.fetch ?? fetch;
	const headers: Record<string, string> = {};
	if (opts?.token) {
		headers['Authorization'] = `Bearer ${opts.token}`;
	}

	const res = await f(`${API_BASE}${path}`, {
		method: 'DELETE',
		headers
	});
	if (!res.ok) {
		throw new ApiError(res.status, await res.text());
	}
}
