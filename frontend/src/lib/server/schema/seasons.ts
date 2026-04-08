import {
	pgTable,
	text,
	integer,
	boolean,
	timestamp,
	date,
	index,
	uniqueIndex,
	primaryKey
} from 'drizzle-orm/pg-core';
import { films } from './films';

/**
 * Seasons table - curated film collections organized by director or theme
 *
 * Seasons represent collections of films grouped together by cinemas,
 * typically focused on a single director (e.g., "Kurosawa at BFI").
 * Unlike festivals which link directly to screenings, seasons link to films
 * and leverage the existing film -> screening relationship.
 *
 * Cross-cinema support: A season can run across multiple venues
 * (e.g., a Hitchcock retrospective at both BFI and Barbican).
 */
export const seasons = pgTable(
	'seasons',
	{
		// Primary key - UUID
		id: text('id').primaryKey(),

		// Identity
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),

		// Description
		description: text('description'),

		// Director association (for director-focused seasons)
		directorName: text('director_name'),
		directorTmdbId: integer('director_tmdb_id'),

		// Date range
		startDate: date('start_date').notNull(),
		endDate: date('end_date').notNull(),

		// Display
		posterUrl: text('poster_url'),
		websiteUrl: text('website_url'),

		// Source tracking
		sourceUrl: text('source_url'),
		sourceCinemas: text('source_cinemas').array().default([]),

		// Raw film titles scraped from cinema website (for re-matching when new films added)
		rawFilmTitles: text('raw_film_titles').array().default([]),

		// Status
		isActive: boolean('is_active').notNull().default(true),

		// Timestamps
		scrapedAt: timestamp('scraped_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('idx_seasons_dates').on(table.startDate, table.endDate),
		index('idx_seasons_director').on(table.directorName),
		index('idx_seasons_active').on(table.isActive),
		uniqueIndex('idx_seasons_slug').on(table.slug)
	]
);

/**
 * Season Films - junction table linking seasons to films (many-to-many)
 */
export const seasonFilms = pgTable(
	'season_films',
	{
		seasonId: text('season_id')
			.notNull()
			.references(() => seasons.id, { onDelete: 'cascade' }),
		filmId: text('film_id')
			.notNull()
			.references(() => films.id, { onDelete: 'cascade' }),

		// Optional ordering within the season (for curated order)
		orderIndex: integer('order_index'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.seasonId, table.filmId] }),
		index('idx_season_films_season').on(table.seasonId),
		index('idx_season_films_film').on(table.filmId)
	]
);
