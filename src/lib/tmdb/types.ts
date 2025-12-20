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
