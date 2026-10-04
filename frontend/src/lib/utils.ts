import { addDaysToDateString, londonDateString } from '$lib/london-date';

// Cached Intl formatters — these helpers run inside hot derived-state loops
// (sort comparators, calendar grouping, per-screening rendering) where
// instantiating a new Intl.DateTimeFormat per call dominates CPU. Allocating
// once at module scope cuts the cost to a single C++ call per format.
const TIME_LONDON_HHMM = new Intl.DateTimeFormat('en-GB', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'Europe/London'
});

const DATE_LONDON_SHORT = new Intl.DateTimeFormat('en-GB', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	timeZone: 'Europe/London'
});

export function formatTime(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return TIME_LONDON_HHMM.format(d);
}

export function formatDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return DATE_LONDON_SHORT.format(d).toUpperCase();
}

const invalidDateWarned = new Set<string>();
export function toLondonDateStr(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	// `toLocaleDateString` on Invalid Date returns the literal "Invalid Date",
	// which silently sorts after every YYYY-MM-DD and excludes the row from
	// range-filter compares without surfacing the upstream data corruption.
	// Log each unique invalid input once so a single bad row doesn't spam the
	// console (this helper is hot — called inside derived map/filter loops).
	if (Number.isNaN(d.getTime())) {
		const key = String(date);
		if (!invalidDateWarned.has(key)) {
			invalidDateWarned.add(key);
			console.warn('toLondonDateStr received invalid date:', date);
		}
	}
	return londonDateString(d);
}

export function formatScreeningDate(date: Date | string): string {
	const dateOnly = typeof date === 'string' && !date.includes('T');
	const d = typeof date === 'string' ? new Date(date + (dateOnly ? 'T12:00:00Z' : '')) : date;
	const todayStr = toLondonDateStr(new Date());
	const targetStr = dateOnly ? date : toLondonDateStr(d);

	if (targetStr === todayStr) return 'TODAY';

	const tomorrowStr = addDaysToDateString(todayStr, 1);
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
	/**
	 * Earliest upcoming screening as ms-since-epoch, pre-computed by the caller.
	 * Avoids `new Date()` allocations inside the sort comparator (O(n log n)
	 * invocations for hundreds of films). Use `Number.POSITIVE_INFINITY` for
	 * films with no remaining screenings — they sort to the end.
	 */
	earliestMs: number;
};

/**
 * Live calendar ordering:
 * 1. Films with a Letterboxd rating first
 * 2. Higher Letterboxd rating
 * 3. Higher TMDB popularity
 * 4. Earlier upcoming screening (uses caller-supplied `earliestMs`)
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

	return a.earliestMs - b.earliestMs;
}

/**
 * Build the editorial byline shown under a film title: `"<director(s)>, <year>"`.
 *
 * Handles both the card view-model shape (`director: string`) and the detail-page
 * canonical shape (`directors: string[]`). Empty/missing fields collapse cleanly
 * — no trailing commas, no `"undefined"` strings.
 */
export function filmByline(film: {
	director?: string | null;
	directors?: string[] | null;
	year?: number | null;
}): string {
	const parts: string[] = [];
	const dirs = film.directors?.length
		? film.directors
		: film.director
			? [film.director]
			: [];
	if (dirs.length) parts.push(dirs.join(', '));
	if (film.year) parts.push(String(film.year));
	return parts.join(', ');
}

/**
 * Build a YYYY-MM-DD string from numeric Y / 0-indexed M / D triplet.
 * Calendar grid builders use this hot — kept allocation-free (no Date object).
 */
export function toISODate(year: number, monthZeroIndexed: number, day: number): string {
	return `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MODAL_FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

interface ModalKeyboardTrapOptions {
	/** Lets a parent modal yield keyboard handling while a nested modal is open. */
	isActive?: () => boolean;
	lockBodyScroll?: boolean;
	returnFocusTo?: HTMLElement;
}

function modalFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR))
		.filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
}

/**
 * Run the standard modal focus lifecycle while the modal is mounted:
 *   - Move initial focus inside and trap Tab/Shift+Tab.
 *   - Escape closes the active modal.
 *   - Restore focus to the trigger on cleanup.
 *   - Lock body scroll unless a nested modal delegates that to its parent.
 */
export function useModalKeyboardTrap(
	container: HTMLElement,
	onClose: () => void,
	options: ModalKeyboardTrapOptions = {}
): () => void {
	const trigger = options.returnFocusTo
		?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
	const isActive = options.isActive ?? (() => true);
	const lockBodyScroll = options.lockBodyScroll ?? true;
	const prevOverflow = document.body.style.overflow;

	if (lockBodyScroll) document.body.style.overflow = 'hidden';

	queueMicrotask(() => {
		if (!isActive() || !container.isConnected) return;
		(modalFocusableElements(container)[0] ?? container).focus({ preventScroll: true });
	});

	const handler = (event: KeyboardEvent) => {
		if (!isActive()) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			// Only the top-most active modal handles this Escape. Without this,
			// closing a nested modal can make its parent active for later
			// document listeners handling the same key event.
			event.stopImmediatePropagation();
			onClose();
			return;
		}

		if (event.key !== 'Tab') return;

		const focusable = modalFocusableElements(container);
		if (focusable.length === 0) {
			event.preventDefault();
			container.focus({ preventScroll: true });
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const current = document.activeElement;

		if (event.shiftKey && (current === first || !container.contains(current))) {
			event.preventDefault();
			last.focus({ preventScroll: true });
		} else if (!event.shiftKey && (current === last || !container.contains(current))) {
			event.preventDefault();
			first.focus({ preventScroll: true });
		}
	};

	document.addEventListener('keydown', handler);

	return () => {
		document.removeEventListener('keydown', handler);
		if (lockBodyScroll) document.body.style.overflow = prevOverflow;
		if (trigger?.isConnected) {
			queueMicrotask(() => trigger.focus({ preventScroll: true }));
		}
	};
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
