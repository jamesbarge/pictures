/**
 * Database connection for SvelteKit SSR
 * Adapted from src/db/index.ts — queries Supabase directly, bypassing the API proxy.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// SvelteKit's server-only env access — $env/static/private is not available at
// module top-level in all build phases, so we read from process.env directly
// (Vercel and SvelteKit dev both inject it into process.env).
const connectionString = process.env.DATABASE_URL;

const hasValidDatabaseUrl =
	!!connectionString &&
	connectionString !== '' &&
	connectionString !== 'disabled' &&
	!connectionString.includes('localhost:5432/postgres');

const client = hasValidDatabaseUrl
	? postgres(connectionString, {
			prepare: false, // Required for Supabase connection pooling (transaction mode)
			max: 1 // Limit connections in serverless
		})
	: postgres('postgres://placeholder:5432/placeholder', {
			prepare: false,
			max: 0 // Don't actually connect
		});

export const db = drizzle(client, { schema });
export const isDatabaseAvailable = hasValidDatabaseUrl;
