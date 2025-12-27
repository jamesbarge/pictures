/**
 * Google Maps API Provider
 * Wraps components with the Google Maps API context
 */

"use client";

import { APIProvider } from "@vis.gl/react-google-maps";

interface MapProviderProps {
  children: React.ReactNode;
}

export function MapProvider({ children }: MapProviderProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-full bg-background-secondary rounded-xl border border-border-default p-8">
        <div className="text-center">
          <p className="text-text-primary font-medium mb-2">Map unavailable</p>
          <p className="text-text-secondary text-sm">
            Google Maps API key not configured
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["drawing", "geometry"]}>
      {children}
    </APIProvider>
  );
}
