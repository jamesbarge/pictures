/**
 * Shared types used by schema definitions.
 * These re-export from $lib/types/* where possible to keep a single source of truth.
 */

export type { ScreeningFormat, EventType } from '$lib/types/screening';
export type { ContentType, CastMember, ReleaseStatus } from '$lib/types/film';
export type {
	CinemaAddress,
	CinemaCoordinates,
	CinemaFeature,
	CinemaProgrammingType
} from '$lib/types/cinema';
