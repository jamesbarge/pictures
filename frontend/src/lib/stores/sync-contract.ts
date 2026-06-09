export type FilmStatusValue = 'want_to_see' | 'seen' | 'not_interested';

export interface ServerFilmStatus {
	filmId: string;
	status: FilmStatusValue;
	updatedAt?: string;
}

export interface FilmStatusesResponse {
	statuses: Record<string, ServerFilmStatus>;
}

export function getServerFilmStatuses(response: FilmStatusesResponse): ServerFilmStatus[] {
	return Object.values(response.statuses);
}
