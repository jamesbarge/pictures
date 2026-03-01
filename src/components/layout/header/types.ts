/**
 * Shared types for header filter subcomponents
 */

export interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  chain: string | null;
}

export interface Season {
  id: string;
  name: string;
  slug: string;
  directorName: string | null;
}

export interface HeaderProps {
  cinemas: Cinema[];
  seasons: Season[];
  availableFormats: string[];
}
