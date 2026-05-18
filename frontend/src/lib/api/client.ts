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

interface RequestOpts {
	fetch?: typeof fetch;
	token?: string;
	signal?: AbortSignal;
}

/**
 * Shared header construction for every verb. JSON bodies get `Content-Type:
 * application/json`; DELETE skips it because it has no body. A bearer token is
 * attached only when present — public endpoints stay unauthenticated.
 */
function buildHeaders(token: string | undefined, jsonBody: boolean): Record<string, string> {
	const headers: Record<string, string> = {};
	if (jsonBody) headers['Content-Type'] = 'application/json';
	if (token) headers['Authorization'] = `Bearer ${token}`;
	return headers;
}

/** Throws `ApiError` on non-2xx, with the body as the message payload. */
async function ensureOk(res: Response): Promise<void> {
	if (!res.ok) throw new ApiError(res.status, await res.text());
}

export async function apiGet<T>(path: string, opts?: RequestOpts): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const res = await f(`${API_BASE}${path}`, {
		headers: buildHeaders(opts?.token, true),
		signal: opts?.signal
	});
	await ensureOk(res);
	return res.json();
}

export async function apiPost<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const res = await f(`${API_BASE}${path}`, {
		method: 'POST',
		headers: buildHeaders(opts?.token, true),
		body: JSON.stringify(body),
		signal: opts?.signal
	});
	await ensureOk(res);
	return res.json();
}

export async function apiPut<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const res = await f(`${API_BASE}${path}`, {
		method: 'PUT',
		headers: buildHeaders(opts?.token, true),
		body: JSON.stringify(body),
		signal: opts?.signal
	});
	await ensureOk(res);
	return res.json();
}

export async function apiDelete(path: string, opts?: RequestOpts): Promise<void> {
	const f = opts?.fetch ?? fetch;
	const res = await f(`${API_BASE}${path}`, {
		method: 'DELETE',
		headers: buildHeaders(opts?.token, false),
		signal: opts?.signal
	});
	await ensureOk(res);
}
