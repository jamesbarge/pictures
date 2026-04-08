/**
 * Cinema Repository — adapted from src/db/repositories/cinema.ts
 * Direct database queries for SvelteKit server load functions.
 */

import { db } from '../db';
import { cinemas, screenings, films } from '../schema';
import { eq, gte, and } from 'drizzle-orm';
import type { ScreeningFormat } from '$lib/types/screening';
import type { ContentType } from '$lib/types/film';
import type { CinemaAddress, CinemaCoordinates, CinemaFeature, CinemaProgrammingType } from '$lib/types/cinema';

export interface CinemaListItem {
	id: string;
	name: string;
	shortName: string | null;
	chain: string | null;
	address: CinemaAddress | null;
	coordinates: CinemaCoordinates | null;
	screens: number | null;
	features: CinemaFeature[];
	programmingFocus: CinemaProgrammingType[];
	website: string;
	bookingUrl: string | null;
	imageUrl: string | null;
	description: string | null;
	isActive: boolean;
}

export type CinemaDetail = CinemaListItem;

export interface CinemaScreening {
	id: string;
	datetime: Date;
	format: ScreeningFormat | null;
	screen: string | null;
	eventType: string | null;
	eventDescription: string | null;
	bookingUrl: string;
	isFestivalScreening: boolean;
	availabilityStatus: string | null;
	hasSubtitles: boolean;
	hasAudioDescription: boolean;
	isRelaxedScreening: boolean;
	film: {
		id: string;
		title: string;
		year: number | null;
		posterUrl: string | null;
		runtime: number | null;
		directors: string[];
		isRepertory: boolean;
		letterboxdRating: number | null;
		contentType: ContentType;
	};
}

export interface CinemaListFilters {
	chain?: string;
	features?: string[];
}

/** Lightweight cinema data for the layout header (FilterBar/CinemaPicker). */
export interface LayoutCinema {
	id: string;
	name: string;
	shortName: string | null;
	address: { area: string } | null;
}

export async function getLayoutCinemas(): Promise<LayoutCinema[]> {
	const results = await db
		.select({
			id: cinemas.id,
			name: cinemas.name,
			shortName: cinemas.shortName,
			address: cinemas.address
		})
		.from(cinemas)
		.where(eq(cinemas.isActive, true))
		.orderBy(cinemas.name);

	return results.map((c) => ({
		id: c.id,
		name: c.name,
		shortName: c.shortName,
		address: (c.address as CinemaAddress | null)?.area
			? { area: (c.address as CinemaAddress).area }
			: null
	}));
}

export async function getActiveCinemas(
	filters?: CinemaListFilters
): Promise<CinemaListItem[]> {
	const results = await db
		.select({
			id: cinemas.id,
			name: cinemas.name,
			shortName: cinemas.shortName,
			chain: cinemas.chain,
			address: cinemas.address,
			coordinates: cinemas.coordinates,
			screens: cinemas.screens,
			features: cinemas.features,
			programmingFocus: cinemas.programmingFocus,
			website: cinemas.website,
			bookingUrl: cinemas.bookingUrl,
			imageUrl: cinemas.imageUrl,
			description: cinemas.description,
			isActive: cinemas.isActive
		})
		.from(cinemas)
		.where(eq(cinemas.isActive, true))
		.orderBy(cinemas.name);

	let filtered = results as CinemaListItem[];

	if (filters?.chain) {
		filtered = filtered.filter((c) => c.chain === filters.chain);
	}

	if (filters?.features && filters.features.length > 0) {
		filtered = filtered.filter((c) =>
			filters.features!.some((f) => (c.features as string[]).includes(f))
		);
	}

	return filtered;
}

export async function getCinemaById(id: string): Promise<CinemaDetail | null> {
	const [cinema] = await db
		.select({
			id: cinemas.id,
			name: cinemas.name,
			shortName: cinemas.shortName,
			chain: cinemas.chain,
			address: cinemas.address,
			coordinates: cinemas.coordinates,
			screens: cinemas.screens,
			features: cinemas.features,
			programmingFocus: cinemas.programmingFocus,
			website: cinemas.website,
			bookingUrl: cinemas.bookingUrl,
			imageUrl: cinemas.imageUrl,
			description: cinemas.description,
			isActive: cinemas.isActive
		})
		.from(cinemas)
		.where(eq(cinemas.id, id))
		.limit(1);

	return (cinema as CinemaDetail) ?? null;
}

export async function getUpcomingScreeningsForCinema(
	cinemaId: string,
	limit = 100
): Promise<CinemaScreening[]> {
	const now = new Date();

	return db
		.select({
			id: screenings.id,
			datetime: screenings.datetime,
			format: screenings.format,
			screen: screenings.screen,
			eventType: screenings.eventType,
			eventDescription: screenings.eventDescription,
			bookingUrl: screenings.bookingUrl,
			isFestivalScreening: screenings.isFestivalScreening,
			availabilityStatus: screenings.availabilityStatus,
			hasSubtitles: screenings.hasSubtitles,
			hasAudioDescription: screenings.hasAudioDescription,
			isRelaxedScreening: screenings.isRelaxedScreening,
			film: {
				id: films.id,
				title: films.title,
				year: films.year,
				posterUrl: films.posterUrl,
				runtime: films.runtime,
				directors: films.directors,
				isRepertory: films.isRepertory,
				letterboxdRating: films.letterboxdRating,
				contentType: films.contentType
			}
		})
		.from(screenings)
		.innerJoin(films, eq(screenings.filmId, films.id))
		.where(and(eq(screenings.cinemaId, cinemaId), gte(screenings.datetime, now)))
		.orderBy(screenings.datetime)
		.limit(limit);
}
