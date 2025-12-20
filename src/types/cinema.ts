/**
 * Cinema venue types and interfaces
 */

export type CinemaFeature =
  | "35mm"
  | "70mm"
  | "imax"
  | "dolby_atmos"
  | "dolby_cinema"
  | "4dx"
  | "bar"
  | "restaurant"
  | "accessible"
  | "hearing_loop"
  | "audio_description";

export type ProgrammingType =
  | "repertory"
  | "arthouse"
  | "mainstream"
  | "documentary"
  | "experimental"
  | "family"
  | "events";

export type DataSourceType = "scrape" | "api" | "manual";

export interface CinemaAddress {
  street: string;
  area: string;
  postcode: string;
  borough: string;
}

export interface CinemaCoordinates {
  lat: number;
  lng: number;
}

export interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  chain: string | null;
  address: CinemaAddress | null;
  coordinates: CinemaCoordinates | null;
  screens: number | null;
  features: CinemaFeature[];
  programmingFocus: ProgrammingType[];
  website: string;
  bookingUrl: string | null;
  dataSourceType: DataSourceType | null;
  dataSourceEndpoint: string | null;
  lastScrapedAt: Date | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
