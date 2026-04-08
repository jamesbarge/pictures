/**
 * Festival Repository
 * Encapsulates festival queries for SvelteKit frontend.
 * Adapted from src/app/api/festivals/route.ts and [slug]/route.ts.
 */

import { db } from '../db';
import { festivals, festivalScreenings, screenings, films, cinemas } from '../schema';
import { eq, and, gte, asc } from 'drizzle-orm';

/** Derive the festival lifecycle status from its date range. */
function computeFestivalStatus(
	startDate: Date | string,
	endDate: Date | string,
	now: Date
): 'upcoming' | 'ongoing' | 'past' {
	const start = new Date(startDate);
	const end = new Date(endDate);
	if (now < start) return 'upcoming';
	if (now > end) return 'past';
	return 'ongoing';
}

/** Derive the ticket sale status from the festival's sale dates. */
function computeTicketStatus(
	festival: { publicSaleDate: string | Date | null; memberSaleDate: string | Date | null },
	now: Date
): 'not_announced' | 'member_sale' | 'on_sale' | null {
	if (!festival.publicSaleDate) return null;
	const publicSale = new Date(festival.publicSaleDate);
	const memberSale = festival.memberSaleDate ? new Date(festival.memberSaleDate) : null;
	if (now >= publicSale) return 'on_sale';
	if (memberSale && now >= memberSale) return 'member_sale';
	return 'not_announced';
}

export interface FestivalSummary {
	id: string;
	name: string;
	slug: string;
	shortName: string | null;
	year: number;
	description: string | null;
	websiteUrl: string | null;
	logoUrl: string | null;
	startDate: string;
	endDate: string;
	genreFocus: string[] | null;
	venues: string[] | null;
	isActive: boolean;
	status: 'upcoming' | 'ongoing' | 'past';
	ticketStatus: 'not_announced' | 'member_sale' | 'on_sale' | null;
}

export interface FestivalScreeningItem {
	id: string;
	datetime: Date;
	format: string | null;
	screen: string | null;
	eventType: string | null;
	eventDescription: string | null;
	bookingUrl: string;
	availabilityStatus: string | null;
	festivalSection: string | null;
	isPremiere: boolean;
	premiereType: string | null;
	film: {
		id: string;
		title: string;
		year: number | null;
		directors: string[];
		posterUrl: string | null;
		runtime: number | null;
	};
	cinema: {
		id: string;
		name: string;
		shortName: string | null;
	};
}

export interface FestivalDetail {
	festival: FestivalSummary & {
		programmAnnouncedDate: string | null;
		memberSaleDate: Date | null;
		publicSaleDate: Date | null;
		screeningCount: number;
	};
	screenings: FestivalScreeningItem[];
	meta: {
		screeningCount: number;
		upcomingCount: number;
		sections: string[];
	};
}

/**
 * Get all active/upcoming festivals with computed status
 */
export async function getActiveFestivals(): Promise<FestivalSummary[]> {
	const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

	const results = await db
		.select({
			id: festivals.id,
			name: festivals.name,
			slug: festivals.slug,
			shortName: festivals.shortName,
			year: festivals.year,
			description: festivals.description,
			websiteUrl: festivals.websiteUrl,
			logoUrl: festivals.logoUrl,
			startDate: festivals.startDate,
			endDate: festivals.endDate,
			genreFocus: festivals.genreFocus,
			venues: festivals.venues,
			isActive: festivals.isActive,
			publicSaleDate: festivals.publicSaleDate,
			memberSaleDate: festivals.memberSaleDate
		})
		.from(festivals)
		.where(and(eq(festivals.isActive, true), gte(festivals.endDate, today)))
		.orderBy(asc(festivals.startDate));

	const now = new Date();
	return results.map((f) => ({
		id: f.id,
		name: f.name,
		slug: f.slug,
		shortName: f.shortName,
		year: f.year,
		description: f.description,
		websiteUrl: f.websiteUrl,
		logoUrl: f.logoUrl,
		startDate: f.startDate,
		endDate: f.endDate,
		genreFocus: f.genreFocus,
		venues: f.venues,
		isActive: f.isActive,
		status: computeFestivalStatus(f.startDate, f.endDate, now),
		ticketStatus: computeTicketStatus(f, now)
	}));
}

/**
 * Get a festival by slug with its screenings
 */
export async function getFestivalBySlug(slug: string): Promise<FestivalDetail | null> {
	// Fetch the festival
	const [festival] = await db
		.select()
		.from(festivals)
		.where(eq(festivals.slug, slug))
		.limit(1);

	if (!festival) {
		return null;
	}

	const now = new Date();
	const status = computeFestivalStatus(festival.startDate, festival.endDate, now);
	const ticketStatus = computeTicketStatus(festival, now);

	// Fetch upcoming screenings
	const screeningResults = await db
		.select({
			id: screenings.id,
			datetime: screenings.datetime,
			format: screenings.format,
			screen: screenings.screen,
			eventType: screenings.eventType,
			eventDescription: screenings.eventDescription,
			bookingUrl: screenings.bookingUrl,
			availabilityStatus: screenings.availabilityStatus,
			festivalSection: festivalScreenings.festivalSection,
			isPremiere: festivalScreenings.isPremiere,
			premiereType: festivalScreenings.premiereType,
			film: {
				id: films.id,
				title: films.title,
				year: films.year,
				directors: films.directors,
				posterUrl: films.posterUrl,
				runtime: films.runtime
			},
			cinema: {
				id: cinemas.id,
				name: cinemas.name,
				shortName: cinemas.shortName
			}
		})
		.from(festivalScreenings)
		.innerJoin(screenings, eq(festivalScreenings.screeningId, screenings.id))
		.innerJoin(films, eq(screenings.filmId, films.id))
		.innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
		.where(
			and(eq(festivalScreenings.festivalId, festival.id), gte(screenings.datetime, now))
		)
		.orderBy(asc(screenings.datetime));

	// Compute meta
	const sections = new Set<string>();
	let upcomingCount = 0;

	for (const screening of screeningResults) {
		if (screening.festivalSection) {
			sections.add(screening.festivalSection);
		}
		if (new Date(screening.datetime) >= now) {
			upcomingCount++;
		}
	}

	return {
		festival: {
			id: festival.id,
			name: festival.name,
			slug: festival.slug,
			shortName: festival.shortName,
			year: festival.year,
			description: festival.description,
			websiteUrl: festival.websiteUrl,
			logoUrl: festival.logoUrl,
			startDate: festival.startDate,
			endDate: festival.endDate,
			programmAnnouncedDate: festival.programmAnnouncedDate,
			memberSaleDate: festival.memberSaleDate,
			publicSaleDate: festival.publicSaleDate,
			genreFocus: festival.genreFocus,
			venues: festival.venues,
			isActive: festival.isActive,
			status,
			ticketStatus,
			screeningCount: screeningResults.length
		},
		screenings: screeningResults,
		meta: {
			screeningCount: screeningResults.length,
			upcomingCount,
			sections: Array.from(sections).sort()
		}
	};
}
