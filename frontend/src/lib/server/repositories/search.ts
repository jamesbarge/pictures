/**
 * Search Repository
 * Film and cinema search queries for SvelteKit frontend.
 * Adapted from src/app/api/films/search/route.ts.
 */

import { db } from '../db';
import { films, screenings, cinemas } from '../schema';
import { ilike, or, asc, gte, lte, eq, and, sql } from 'drizzle-orm';
import { addDays } from 'date-fns';
import type { CinemaAddress } from '$lib/types/cinema';

export interface SearchFilmResult {
	id: string;
	title: string;
	year: number | null;
	directors: string[];
	posterUrl: string | null;
}

export interface SearchCinemaResult {
	id: string;
	name: string;
	shortName: string | null;
	address: string | null;
}

export interface SearchResults {
	results: SearchFilmResult[];
	cinemas: SearchCinemaResult[];
}

function formatCinemaAddress(address: CinemaAddress | null): string | null {
	if (!address) return null;
	const parts = [address.street, address.area, address.postcode].filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Search films and cinemas by query string.
 * Films are filtered to only those with upcoming screenings (next 30 days).
 * If no query is provided and browse=true, returns all films with upcoming screenings.
 */
export async function searchFilmsAndCinemas(
	query?: string,
	options?: { browse?: boolean }
): Promise<SearchResults> {
	const startDate = new Date();
	const endDate = addDays(startDate, 30);

	// Browse mode: return films with upcoming screenings, alphabetically
	if (options?.browse && !query) {
		const [filmResults, cinemaResults] = await Promise.all([
			db
				.selectDistinct({
					id: films.id,
					title: films.title,
					year: films.year,
					directors: films.directors,
					posterUrl: films.posterUrl
				})
				.from(films)
				.innerJoin(screenings, eq(films.id, screenings.filmId))
				.where(and(gte(screenings.datetime, startDate), lte(screenings.datetime, endDate)))
				.orderBy(asc(films.title))
				.limit(200),
			db
				.select({
					id: cinemas.id,
					name: cinemas.name,
					shortName: cinemas.shortName,
					address: cinemas.address
				})
				.from(cinemas)
				.where(eq(cinemas.isActive, true))
				.orderBy(asc(cinemas.name))
		]);

		return {
			results: filmResults,
			cinemas: cinemaResults.map((c) => ({
				...c,
				address: formatCinemaAddress(c.address as CinemaAddress | null)
			}))
		};
	}

	// Search mode: filter by query, only films with upcoming screenings
	if (!query || query.length < 2) {
		return { results: [], cinemas: [] };
	}

	const searchPattern = `%${query}%`;

	const [filmResults, cinemaResults] = await Promise.all([
		db
			.selectDistinct({
				id: films.id,
				title: films.title,
				year: films.year,
				directors: films.directors,
				posterUrl: films.posterUrl
			})
			.from(films)
			.innerJoin(screenings, eq(films.id, screenings.filmId))
			.where(
				and(
					gte(screenings.datetime, startDate),
					lte(screenings.datetime, endDate),
					or(
						ilike(films.title, searchPattern),
						sql`array_to_string(${films.directors}, ', ') ILIKE ${searchPattern}`
					)
				)
			)
			.orderBy(asc(films.title))
			.limit(50),
		db
			.select({
				id: cinemas.id,
				name: cinemas.name,
				shortName: cinemas.shortName,
				address: cinemas.address
			})
			.from(cinemas)
			.where(
				and(
					eq(cinemas.isActive, true),
					or(ilike(cinemas.name, searchPattern), ilike(cinemas.shortName, searchPattern))
				)
			)
			.orderBy(asc(cinemas.name))
			.limit(10)
	]);

	return {
		results: filmResults,
		cinemas: cinemaResults.map((c) => ({
			...c,
			address: formatCinemaAddress(c.address as CinemaAddress | null)
		}))
	};
}
