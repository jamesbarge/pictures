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
	signal?: AbortSignal;
}

// Every endpoint the frontend calls is public and JSON. There is no bearer-token
// option because there is no auth on pictures.london — the `token` param and the
// `apiPut`/`apiDelete` helpers went with Clerk (see the 2026-07-27 changelog).
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Throws `ApiError` on non-2xx, with the body as the message payload. */
async function ensureOk(res: Response): Promise<void> {
	if (!res.ok) throw new ApiError(res.status, await res.text());
}

export async function apiGet<T>(path: string, opts?: RequestOpts): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const res = await f(`${API_BASE}${path}`, {
		headers: JSON_HEADERS,
		signal: opts?.signal
	});
	await ensureOk(res);
	return res.json();
}

export async function apiPost<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
	const f = opts?.fetch ?? fetch;
	const res = await f(`${API_BASE}${path}`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(body),
		signal: opts?.signal
	});
	await ensureOk(res);
	return res.json();
}
