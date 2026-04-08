import {
	pgTable,
	text,
	integer,
	boolean,
	timestamp,
	date,
	index,
	primaryKey
} from 'drizzle-orm/pg-core';
import { screenings } from './screenings';

/**
 * Festivals table - represents discrete film festivals in London
 * Examples: BFI London Film Festival, BFI Flare, Raindance, FrightFest
 */
export const festivals = pgTable(
	'festivals',
	{
		// Primary key - UUID
		id: text('id').primaryKey(),

		// Identity
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		shortName: text('short_name'),
		year: integer('year').notNull(),

		// Description
		description: text('description'),
		websiteUrl: text('website_url'),
		logoUrl: text('logo_url'),

		// Dates
		startDate: date('start_date').notNull(),
		endDate: date('end_date').notNull(),

		// Ticket sale dates
		programmAnnouncedDate: date('programme_announced_date'),
		memberSaleDate: timestamp('member_sale_date', { withTimezone: true }),
		publicSaleDate: timestamp('public_sale_date', { withTimezone: true }),

		// Classification
		genreFocus: text('genre_focus').array().default([]),
		venues: text('venues').array().default([]),

		// Status
		isActive: boolean('is_active').notNull().default(true),

		// Source tracking
		scrapedAt: timestamp('scraped_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('idx_festivals_dates').on(table.startDate, table.endDate),
		index('idx_festivals_year').on(table.year),
		index('idx_festivals_active').on(table.isActive)
	]
);

/**
 * Festival Screenings - links screenings to festivals (many-to-many)
 */
export const festivalScreenings = pgTable(
	'festival_screenings',
	{
		festivalId: text('festival_id')
			.notNull()
			.references(() => festivals.id, { onDelete: 'cascade' }),
		screeningId: text('screening_id')
			.notNull()
			.references(() => screenings.id, { onDelete: 'cascade' }),

		// Festival-specific metadata
		festivalSection: text('festival_section'),
		isPremiere: boolean('is_premiere').notNull().default(false),
		premiereType: text('premiere_type'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.festivalId, table.screeningId] }),
		index('idx_festival_screenings_festival').on(table.festivalId),
		index('idx_festival_screenings_screening').on(table.screeningId)
	]
);
