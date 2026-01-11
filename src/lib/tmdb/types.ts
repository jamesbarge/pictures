/**
 * TMDB API Response Types
 */

export interface TMDBSearchResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genre_ids: number[];
  original_language: string;
  adult: boolean;
  popularity: number;
}

export interface TMDBSearchResponse {
  page: number;
  results: TMDBSearchResult[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  tagline: string;
  overview: string;
  release_date: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genres: TMDBGenre[];
  production_countries: TMDBCountry[];
  spoken_languages: TMDBLanguage[];
  status: string;
  adult: boolean;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBCountry {
  iso_3166_1: string;
  name: string;
}

export interface TMDBLanguage {
  iso_639_1: string;
  name: string;
  english_name: string;
}

export interface TMDBCredits {
  id: number;
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TMDBVideosResponse {
  id: number;
  results: TMDBVideo[];
}

export interface TMDBReleaseDates {
  id: number;
  results: {
    iso_3166_1: string;
    release_dates: {
      certification: string;
      type: number;
      release_date: string;
    }[];
  }[];
}

// Person (Director) types

export interface TMDBPersonSearchResult {
  id: number;
  name: string;
  original_name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  gender: number; // 0=unknown, 1=female, 2=male, 3=non-binary
  known_for: TMDBPersonKnownFor[];
}

export interface TMDBPersonKnownFor {
  id: number;
  title?: string; // For movies
  name?: string; // For TV shows
  media_type: "movie" | "tv";
  release_date?: string;
  first_air_date?: string;
}

export interface TMDBPersonSearchResponse {
  page: number;
  results: TMDBPersonSearchResult[];
  total_pages: number;
  total_results: number;
}

export interface TMDBPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  imdb_id: string | null;
  homepage: string | null;
  known_for_department: string;
  popularity: number;
  gender: number;
  also_known_as: string[];
}

export interface TMDBPersonCredits {
  id: number;
  crew: TMDBPersonCrewCredit[];
  cast: TMDBPersonCastCredit[];
}

export interface TMDBPersonCrewCredit {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  job: string;
  department: string;
  poster_path: string | null;
  vote_average: number;
}

export interface TMDBPersonCastCredit {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  character: string;
  poster_path: string | null;
  vote_average: number;
}
