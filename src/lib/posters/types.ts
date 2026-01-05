/**
 * Poster Service Types
 */

export type PosterSource =
  | "tmdb"
  | "omdb"
  | "fanart"
  | "scraper"
  | "source_image"  // Scraped image for non-film content (concerts, events)
  | "placeholder";

export interface PosterResult {
  url: string;
  source: PosterSource;
  width?: number;
  height?: number;
  quality: "high" | "medium" | "low" | "placeholder";
}

export interface PosterSearchParams {
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: number;
  director?: string;
  // Poster URL extracted from scraper (cinema website)
  scraperPosterUrl?: string;
  // Content type for routing - non-films skip TMDB lookup
  contentType?: "film" | "concert" | "live_broadcast" | "event";
}

export interface OMDBSearchResult {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
  Response: string;
  Error?: string;
}

export interface OMDBMovieDetails {
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string;
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: { Source: string; Value: string }[];
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: string;
  DVD: string;
  BoxOffice: string;
  Production: string;
  Website: string;
  Response: string;
  Error?: string;
}

export interface FanartMovieImages {
  name: string;
  tmdb_id: string;
  imdb_id: string;
  hdmovielogo?: FanartImage[];
  movieposter?: FanartImage[];
  moviebackground?: FanartImage[];
  moviethumb?: FanartImage[];
  moviebanner?: FanartImage[];
  moviedisc?: FanartImage[];
  movieart?: FanartImage[];
}

export interface FanartImage {
  id: string;
  url: string;
  lang: string;
  likes: string;
}
