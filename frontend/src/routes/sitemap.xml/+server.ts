import type { RequestHandler } from './$types';
import { apiFetch } from '$lib/server/api';

/**
 * Dynamic sitemap for pictures.london.
 *
 * Emits public, crawlable URLs: static routes, cinema detail pages, festival
 * pages, people (director/actor) pages, and film detail pages. Auth/user pages
 * (sign-in, settings, watchlist) are deliberately excluded.
 *
 * Resilience: a sitemap must never 500 — every upstream fetch degrades to an
 * empty list so a single failing API call can't take the whole sitemap down.
 *
 * Films come from the top-200 `browse` payload.
 */

// Apex host — must match the canonical URLs the app declares everywhere
// (`$lib/seo/json-ld.ts` BASE_URL, the `+layout.svelte` canonical, the
// `/people/[name]` canonical). A sitemap host that disagrees with the
// `<link rel="canonical">` tags sends crawlers competing signals.
const SITE = 'https://pictures.london';

// People window: 60 days is the verified-safe boundary — `/api/people/{name}`
// serves 200 for everyone the `directors?days=60` list contains. Widening risks
// emitting URLs the detail endpoint would 404.
const PEOPLE_WINDOW_DAYS = 60;

interface UrlEntry {
	loc: string;
	changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly';
	priority?: number;
}

const STATIC_ENTRIES: UrlEntry[] = [
	{ loc: '/', changefreq: 'daily', priority: 1.0 },
	{ loc: '/tonight', changefreq: 'daily', priority: 0.9 },
	{ loc: '/this-weekend', changefreq: 'daily', priority: 0.9 },
	{ loc: '/cinemas', changefreq: 'weekly', priority: 0.8 },
	{ loc: '/festivals', changefreq: 'weekly', priority: 0.7 },
	{ loc: '/directors', changefreq: 'weekly', priority: 0.6 },
	{ loc: '/reachable', changefreq: 'weekly', priority: 0.5 },
	{ loc: '/map', changefreq: 'monthly', priority: 0.5 },
	{ loc: '/search', changefreq: 'monthly', priority: 0.4 },
	{ loc: '/letterboxd', changefreq: 'monthly', priority: 0.4 },
	{ loc: '/about', changefreq: 'yearly', priority: 0.3 },
	{ loc: '/privacy', changefreq: 'yearly', priority: 0.2 },
	{ loc: '/terms', changefreq: 'yearly', priority: 0.2 }
];

function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

async function cinemaEntries(fetch: typeof globalThis.fetch): Promise<UrlEntry[]> {
	const data = await apiFetch<{ cinemas: Array<{ id: string }> }>('/api/cinemas', fetch).catch(
		() => ({ cinemas: [] })
	);
	return data.cinemas
		.filter((c) => c.id)
		.map((c) => ({
			loc: `/cinemas/${encodeURIComponent(c.id)}`,
			changefreq: 'weekly' as const,
			priority: 0.7
		}));
}

async function festivalEntries(fetch: typeof globalThis.fetch): Promise<UrlEntry[]> {
	const data = await apiFetch<{ festivals: Array<{ slug: string }> }>(
		'/api/festivals',
		fetch
	).catch(() => ({ festivals: [] }));
	return data.festivals
		.filter((f) => f.slug)
		.map((f) => ({
			loc: `/festivals/${encodeURIComponent(f.slug)}`,
			changefreq: 'weekly' as const,
			priority: 0.6
		}));
}

async function peopleEntries(fetch: typeof globalThis.fetch): Promise<UrlEntry[]> {
	const data = await apiFetch<{ directors: Array<{ name: string }> }>(
		`/api/directors?days=${PEOPLE_WINDOW_DAYS}`,
		fetch
	).catch(() => ({ directors: [] }));
	return data.directors
		.filter((d) => d.name)
		.map((d) => ({
			loc: `/people/${encodeURIComponent(d.name)}`,
			changefreq: 'weekly' as const,
			priority: 0.5
		}));
}

async function filmEntries(fetch: typeof globalThis.fetch): Promise<UrlEntry[]> {
	const data = await apiFetch<{ results: Array<{ id: string }> }>(
		'/api/films/search?browse=true',
		fetch
	).catch(() => ({ results: [] }));
	return data.results
		.filter((f) => f.id)
		.map((f) => ({
			loc: `/film/${encodeURIComponent(f.id)}`,
			changefreq: 'weekly' as const,
			priority: 0.6
		}));
}

function renderUrl(entry: UrlEntry): string {
	const lines = [`    <loc>${xmlEscape(SITE + entry.loc)}</loc>`];
	if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
	if (entry.priority !== undefined) lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
	return `  <url>\n${lines.join('\n')}\n  </url>`;
}

export const GET: RequestHandler = async ({ fetch, setHeaders }) => {
	const [cinemas, festivals, people, films] = await Promise.all([
		cinemaEntries(fetch),
		festivalEntries(fetch),
		peopleEntries(fetch),
		filmEntries(fetch)
	]);

	const entries = [...STATIC_ENTRIES, ...cinemas, ...festivals, ...people, ...films];

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(renderUrl).join('\n')}
</urlset>`;

	setHeaders({
		'Content-Type': 'application/xml',
		// Cache hard at the CDN; revalidate in the background. Sitemap content
		// changes slowly relative to how often crawlers fetch it.
		'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
	});

	return new Response(xml);
};
