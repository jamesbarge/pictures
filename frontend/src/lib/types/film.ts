export type Genre =
	| 'action' | 'adventure' | 'animation' | 'comedy' | 'crime'
	| 'documentary' | 'drama' | 'experimental' | 'family' | 'fantasy'
	| 'horror' | 'musical' | 'mystery' | 'romance' | 'scifi'
	| 'thriller' | 'war' | 'western';

export type ReleaseStatus = 'theatrical' | 'restoration' | 'revival' | 'preview';

export type ContentType = 'film' | 'concert' | 'live_broadcast' | 'event';

export type FilmStatus = 'want_to_see' | 'seen' | 'not_interested';

export interface CastMember {
	name: string;
	character?: string;
	order: number;
	tmdbId?: number;
}

export interface Film {
	id: string;
	tmdbId: number | null;
	imdbId: string | null;
	title: string;
	originalTitle: string | null;
	year: number | null;
	runtime: number | null;
	directors: string[];
	cast: CastMember[];
	genres: Genre[];
	countries: string[];
	languages: string[];
	certification: string | null;
	synopsis: string | null;
	tagline: string | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	trailerUrl: string | null;
	isRepertory: boolean;
	releaseStatus: ReleaseStatus | null;
	decade: string | null;
	tmdbRating: number | null;
	letterboxdUrl: string | null;
	letterboxdRating: number | null;
	contentType: ContentType;
	sourceImageUrl: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface UserFilmStatus {
	filmId: string;
	status: FilmStatus;
	updatedAt: string;
}
