import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatTime(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'Europe/London'
	});
}

export function formatDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/London'
	}).toUpperCase();
}

export function toLondonDateStr(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
}

export function formatScreeningDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date + (typeof date === 'string' && !date.includes('T') ? 'T00:00:00' : '')) : date;
	const todayStr = toLondonDateStr(new Date());
	const targetStr = typeof date === 'string' && !date.includes('T') ? date : toLondonDateStr(d);

	if (targetStr === todayStr) return 'TODAY';

	// Check tomorrow
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const tomorrowStr = toLondonDateStr(tomorrow);
	if (targetStr === tomorrowStr) return 'TOMORROW';

	return formatDate(d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
	fn: T,
	ms: number
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = keyFn(item);
		(groups[key] ??= []).push(item);
	}
	return groups;
}

type CalendarSortableFilm = {
	film: {
		letterboxdRating: number | null | undefined;
		tmdbPopularity?: number | null | undefined;
	};
	screenings: Array<{ datetime: string }>;
};

function getEarliestScreeningTime(screenings: Array<{ datetime: string }>): number {
	const first = screenings[0]?.datetime;
	if (!first) return Number.POSITIVE_INFINITY;

	const time = new Date(first).getTime();
	return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Live calendar ordering:
 * 1. Films with a Letterboxd rating first
 * 2. Higher Letterboxd rating
 * 3. Higher TMDB popularity
 * 4. Earlier upcoming screening
 */
export function compareFilmsByCalendarPriority<T extends CalendarSortableFilm>(a: T, b: T): number {
	const aHasRating = a.film.letterboxdRating != null;
	const bHasRating = b.film.letterboxdRating != null;
	if (aHasRating !== bHasRating) return Number(bHasRating) - Number(aHasRating);

	const aRating = a.film.letterboxdRating ?? -1;
	const bRating = b.film.letterboxdRating ?? -1;
	if (aRating !== bRating) return bRating - aRating;

	const aPopularity = a.film.tmdbPopularity ?? -1;
	const bPopularity = b.film.tmdbPopularity ?? -1;
	if (aPopularity !== bPopularity) return bPopularity - aPopularity;

	return getEarliestScreeningTime(a.screenings) - getEarliestScreeningTime(b.screenings);
}

type TmdbPosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780';

interface PosterImageOptions {
	baseSize: TmdbPosterSize;
	srcSetSizes?: TmdbPosterSize[];
	sizes?: string;
}

interface PosterImageAttributes {
	src: string;
	srcset?: string;
	sizes?: string;
}

const TMDB_IMAGE_HOST = 'image.tmdb.org';
const TMDB_POSTER_PATH = /^\/t\/p\/(?:w92|w154|w185|w342|w500|w780|original)(\/.+)$/;

function getTmdbPosterPath(posterUrl: string): string | null {
	try {
		const url = new URL(posterUrl);
		if (url.hostname !== TMDB_IMAGE_HOST) return null;

		const match = url.pathname.match(TMDB_POSTER_PATH);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

function buildTmdbPosterUrl(path: string, size: TmdbPosterSize): string {
	return `https://${TMDB_IMAGE_HOST}/t/p/${size}${path}`;
}

export function getPosterImageAttributes(
	posterUrl: string | null | undefined,
	options: PosterImageOptions
): PosterImageAttributes | null {
	if (!posterUrl) return null;

	const tmdbPosterPath = getTmdbPosterPath(posterUrl);
	if (!tmdbPosterPath) {
		return { src: posterUrl };
	}

	const srcSetSizes = options.srcSetSizes?.length ? options.srcSetSizes : [options.baseSize];

	return {
		src: buildTmdbPosterUrl(tmdbPosterPath, options.baseSize),
		srcset: srcSetSizes
			.map((size) => `${buildTmdbPosterUrl(tmdbPosterPath, size)} ${size.slice(1)}w`)
			.join(', '),
		sizes: options.sizes
	};
}

/**
 * Haversine great-circle distance in miles between two lat/lng points.
 * Used for the "within N miles" filter on the homepage sidebar.
 */
export function haversineMiles(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number }
): number {
	const R = 3958.8; // Earth radius in miles
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const la1 = toRad(a.lat);
	const la2 = toRad(b.lat);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}
