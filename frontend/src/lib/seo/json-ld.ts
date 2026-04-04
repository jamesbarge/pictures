/**
 * JSON-LD Schema generators for SEO
 * Ported from Next.js production site
 */

import type { Film } from '$lib/types/film';
import type { Cinema } from '$lib/types/cinema';

const BASE_URL = 'https://pictures.london';
const BRAND_NAME = 'pictures · london';

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
		data.aggregateRating = {
			'@type': 'AggregateRating',
			ratingValue: film.tmdbRating.toFixed(1),
			bestRating: '10',
			worstRating: '0',
			ratingCount: 1000
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

// ── ScreeningEvent (film detail page) ───────────────────────────

export function screeningEventSchema(
	screening: { id: string; datetime: string; bookingUrl: string; format: string | null },
	film: { title: string; posterUrl: string | null },
	cinema: Cinema
) {
	const data: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'ScreeningEvent',
		name: `${film.title} at ${cinema.name}`,
		startDate: screening.datetime,
		location: {
			'@type': 'MovieTheater',
			name: cinema.name,
			url: cinema.website,
			...(cinema.address && {
				address: {
					'@type': 'PostalAddress',
					streetAddress: cinema.address.street,
					addressLocality: cinema.address.area,
					postalCode: cinema.address.postcode,
					addressRegion: cinema.address.borough,
					addressCountry: 'GB'
				}
			})
		},
		workPresented: { '@type': 'Movie', name: film.title, image: film.posterUrl },
		url: screening.bookingUrl,
		eventStatus: 'https://schema.org/EventScheduled',
		eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
		offers: {
			'@type': 'Offer',
			url: screening.bookingUrl,
			availability: 'https://schema.org/InStock',
			priceCurrency: 'GBP'
		}
	};

	if (screening.format && screening.format !== 'unknown') {
		data.videoFormat = screening.format.toUpperCase();
	}

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
			item: item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`
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

// ── ItemList (directory pages) ──────────────────────────────────

export function itemListSchema(
	name: string,
	description: string,
	items: { name: string; url: string; position: number }[]
) {
	return {
		'@context': 'https://schema.org',
		'@type': 'ItemList',
		name,
		description,
		numberOfItems: items.length,
		itemListElement: items.map((item) => ({
			'@type': 'ListItem',
			position: item.position,
			name: item.name,
			url: item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`
		}))
	};
}
