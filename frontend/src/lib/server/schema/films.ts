import {
	pgTable,
	text,
	integer,
	boolean,
	timestamp,
	jsonb,
	real,
	index
} from 'drizzle-orm/pg-core';
import type { CastMember, ReleaseStatus, ContentType } from './types';

/**
 * Films table - stores film metadata enriched from TMDB
 */
export const films = pgTable(
	'films',
	{
		// Primary key - UUID
		id: text('id').primaryKey(),

		// External IDs
		tmdbId: integer('tmdb_id').unique(),
		imdbId: text('imdb_id'),

		// Core info
		title: text('title').notNull(),
		originalTitle: text('original_title'),
		year: integer('year'),
		runtime: integer('runtime'), // Minutes

		// Credits
		directors: text('directors').array().notNull().default([]),
		cast: jsonb('cast').$type<CastMember[]>().notNull().default([]),

		// Classification
		genres: text('genres').array().notNull().default([]),
		countries: text('countries').array().notNull().default([]),
		languages: text('languages').array().notNull().default([]),
		certification: text('certification'), // "15", "PG", "U", etc.

		// Content
		synopsis: text('synopsis'),
		tagline: text('tagline'),

		// Media URLs (from TMDB)
		posterUrl: text('poster_url'),
		backdropUrl: text('backdrop_url'),
		trailerUrl: text('trailer_url'),

		// Categorization
		isRepertory: boolean('is_repertory').notNull().default(false),
		releaseStatus: text('release_status').$type<ReleaseStatus>(),
		decade: text('decade'), // "1970s", "1980s", etc.

		// Content classification (AI-determined)
		contentType: text('content_type').$type<ContentType>().notNull().default('film'),
		// Original image URL from cinema website (fallback for non-film content)
		sourceImageUrl: text('source_image_url'),

		// External ratings
		tmdbRating: real('tmdb_rating'),
		letterboxdUrl: text('letterboxd_url'),
		letterboxdRating: real('letterboxd_rating'), // 0-5 scale

		// Match tracking
		matchConfidence: real('match_confidence'),
		matchStrategy: text('match_strategy'),
		matchedAt: timestamp('matched_at', { withTimezone: true }),

		// Enrichment tracking
		enrichmentStatus: jsonb('enrichment_status').$type<Record<string, unknown>>(),

		// Metadata
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('idx_films_title').on(table.title),
		index('idx_films_repertory').on(table.isRepertory),
		index('idx_films_year').on(table.year),
		index('idx_films_match_strategy').on(table.matchStrategy),
		index('idx_films_content_type').on(table.contentType)
	]
);
