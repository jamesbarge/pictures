/**
 * JSON-LD Schema generators for SEO
 * Ported from Next.js production site
 */

import type { Film } from '$lib/types/film';

const BASE_URL = 'https://pictures.london';
const BRAND_NAME = 'pictures · london';

/** Prefix a path with BASE_URL unless it's already absolute. */
function absoluteUrl(url: string): string {
	return url.startsWith('http') ? url : `${BASE_URL}${url}`;
}

// ── Organization (root layout) ──────────────────────────────────

export function organizationSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: BRAND_NAME,
		url: BASE_URL,
		logo: `${BASE_URL}/logo.png`,
		description:
			'The definitive cinema listings for London cinephiles. Find screenings at cinemas including BFI Southbank, Prince Charles Cinema, ICA, and more.',
		contactPoint: {
			'@type': 'ContactPoint',
			contactType: 'customer service',
			url: `${BASE_URL}/about`
		}
	};
}

// ── WebSite (home page) ─────────────────────────────────────────

export function webSiteSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: BRAND_NAME,
		alternateName: `${BRAND_NAME} London Cinema Listings`,
		url: BASE_URL,
		description:
			'Find and track film screenings at London cinemas. Updated daily with showtimes from BFI, Prince Charles, Curzon, Picturehouse, and more.',
		potentialAction: {
			'@type': 'SearchAction',
			target: {
				'@type': 'EntryPoint',
				urlTemplate: `${BASE_URL}/search?q={search_term_string}`
			},
			'query-input': 'required name=search_term_string'
		}
	};
}

// ── Movie (film detail page) ────────────────────────────────────

export function movieSchema(film: Film) {
	const data: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'Movie',
		name: film.title,
		url: `${BASE_URL}/film/${film.id}`,
		dateCreated: film.year ? `${film.year}` : undefined,
		description: film.synopsis || `${film.title} (${film.year || 'N/A'})`,
		genre: film.genres,
		director: film.directors.map((name) => ({ '@type': 'Person', name })),
		actor: film.cast.slice(0, 10).map((member) => ({ '@type': 'Person', name: member.name }))
	};

	if (film.posterUrl) data.image = film.posterUrl;
	if (film.runtime) data.duration = `PT${film.runtime}M`;
	if (film.certification) data.contentRating = film.certification;

	if (film.tmdbRating) {
		// `ratingCount` is omitted intentionally: we don't have the underlying
		// vote count on the Film shape. The Schema.org spec allows AggregateRating
		// without it (`reviewCount`/`ratingCount` are recommended, not required).
		// Hard-coding `1000` previously was factually wrong and a Google
		// structured-data validation flag if the bot cross-checks vs TMDB.
		data.aggregateRating = {
			'@type': 'AggregateRating',
			ratingValue: film.tmdbRating.toFixed(1),
			bestRating: '10',
			worstRating: '0'
		};
	}

	if (film.countries.length > 0) {
		data.countryOfOrigin = film.countries.map((country) => ({ '@type': 'Country', name: country }));
	}

	const sameAs: string[] = [];
	if (film.imdbId) sameAs.push(`https://www.imdb.com/title/${film.imdbId}/`);
	if (film.tmdbId) sameAs.push(`https://www.themoviedb.org/movie/${film.tmdbId}`);
	if (film.letterboxdUrl) sameAs.push(film.letterboxdUrl);
	if (sameAs.length > 0) data.sameAs = sameAs;

	return data;
}

// ── Breadcrumb ──────────────────────────────────────────────────

export function breadcrumbSchema(items: { name: string; url: string }[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: absoluteUrl(item.url)
		}))
	};
}

// ── FAQ (home page) ─────────────────────────────────────────────

export function faqSchema(items: { question: string; answer: string }[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: { '@type': 'Answer', text: item.answer }
		}))
	};
}

// ── Person (director / actor pages) ─────────────────────────────

export function personSchema(name: string, roles: string[], filmTitles: string[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'Person',
		name,
		...(roles.length ? { jobTitle: roles } : {}),
		url: absoluteUrl(`/people/${encodeURIComponent(name)}`),
		...(filmTitles.length ? { knowsAbout: filmTitles } : {})
	};
}
