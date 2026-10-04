/**
 * Cinema venue types and interfaces
 */

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
