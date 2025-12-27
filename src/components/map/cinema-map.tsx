/**
 * Cinema Map Component
 * Interactive Google Map with cinema markers and polygon drawing
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Map,
  useMap,
  useMapsLibrary,
  Marker,
} from "@vis.gl/react-google-maps";
import { MapPin, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CinemaCoordinates } from "@/types/cinema";
import type { MapArea } from "@/lib/geo-utils";
import { isCinemaInArea } from "@/lib/geo-utils";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  coordinates: CinemaCoordinates | null;
}

interface CinemaMapProps {
  cinemas: Cinema[];
  mapArea: MapArea | null;
  onAreaChange: (area: MapArea | null) => void;
}

// London center coordinates
const LONDON_CENTER = { lat: 51.5074, lng: -0.1278 };
const DEFAULT_ZOOM = 12;

export function CinemaMap({ cinemas, mapArea, onAreaChange }: CinemaMapProps) {
  const [isDrawing, setIsDrawing] = useState(false);

  return (
    <div className="relative w-full h-full">
      <Map
        defaultCenter={LONDON_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        gestureHandling="greedy"
        disableDefaultUI={false}
        zoomControl={true}
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        {/* Cinema Markers */}
        {cinemas.map((cinema) => (
          <CinemaMarker
            key={cinema.id}
            cinema={cinema}
            isInArea={
              mapArea ? isCinemaInArea(cinema.coordinates!, mapArea) : true
            }
          />
        ))}

        {/* Drawing Manager */}
        <DrawingManager
          isDrawing={isDrawing}
          mapArea={mapArea}
          onAreaComplete={(area) => {
            onAreaChange(area);
            setIsDrawing(false);
          }}
          onAreaClear={() => onAreaChange(null)}
        />
      </Map>

      {/* Drawing Controls */}
      <DrawingControls
        isDrawing={isDrawing}
        hasArea={!!mapArea}
        onStartDrawing={() => setIsDrawing(true)}
        onCancelDrawing={() => setIsDrawing(false)}
        onClearArea={() => {
          onAreaChange(null);
          setIsDrawing(false);
        }}
        cinemasInArea={
          mapArea
            ? cinemas.filter(
                (c) => c.coordinates && isCinemaInArea(c.coordinates, mapArea)
              ).length
            : cinemas.length
        }
        totalCinemas={cinemas.length}
      />
    </div>
  );
}

/**
 * Cinema Marker Component
 */
function CinemaMarker({
  cinema,
  isInArea,
}: {
  cinema: Cinema;
  isInArea: boolean;
}) {
  if (!cinema.coordinates) return null;

  return (
    <Marker
      position={cinema.coordinates}
      title={cinema.shortName || cinema.name}
      opacity={isInArea ? 1 : 0.5}
    />
  );
}

/**
 * Drawing Manager - Handles polygon drawing on the map
 */
function DrawingManager({
  isDrawing,
  mapArea,
  onAreaComplete,
  onAreaClear,
}: {
  isDrawing: boolean;
  mapArea: MapArea | null;
  onAreaComplete: (area: MapArea) => void;
  onAreaClear: () => void;
}) {
  const map = useMap();
  const drawing = useMapsLibrary("drawing");
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(
    null
  );
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  // Create or update the existing polygon overlay
  useEffect(() => {
    if (!map || !mapArea) {
      // Clear existing polygon if no area
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
      return;
    }

    // If polygon already exists, update it
    if (polygonRef.current) {
      const path = mapArea.paths.map(
        (p) => new google.maps.LatLng(p.lat, p.lng)
      );
      polygonRef.current.setPath(path);
    } else {
      // Create new polygon
      const polygon = new google.maps.Polygon({
        paths: mapArea.paths,
        fillColor: "#6366f1",
        fillOpacity: 0.15,
        strokeColor: "#6366f1",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      });

      polygon.setMap(map);
      polygonRef.current = polygon;

      // Listen for edits
      google.maps.event.addListener(polygon.getPath(), "set_at", () => {
        updateAreaFromPolygon(polygon, onAreaComplete);
      });
      google.maps.event.addListener(polygon.getPath(), "insert_at", () => {
        updateAreaFromPolygon(polygon, onAreaComplete);
      });
      google.maps.event.addListener(polygon, "dragend", () => {
        updateAreaFromPolygon(polygon, onAreaComplete);
      });
    }

    return () => {
      // Cleanup handled by the mapArea null check
    };
  }, [map, mapArea, onAreaComplete]);

  // Handle drawing manager
  useEffect(() => {
    if (!map || !drawing) return;

    if (isDrawing) {
      // Clear any existing polygon when starting to draw
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
        onAreaClear();
      }

      // Create drawing manager
      const manager = new drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
          fillColor: "#6366f1",
          fillOpacity: 0.15,
          strokeColor: "#6366f1",
          strokeWeight: 2,
          editable: true,
          draggable: true,
        },
      });

      manager.setMap(map);
      drawingManagerRef.current = manager;

      // Listen for polygon completion
      google.maps.event.addListener(
        manager,
        "overlaycomplete",
        (event: google.maps.drawing.OverlayCompleteEvent) => {
          if (event.type === google.maps.drawing.OverlayType.POLYGON) {
            const polygon = event.overlay as google.maps.Polygon;

            // Store reference and disable drawing mode
            polygonRef.current = polygon;
            manager.setDrawingMode(null);
            manager.setMap(null);
            drawingManagerRef.current = null;

            // Extract paths and call callback
            updateAreaFromPolygon(polygon, onAreaComplete);

            // Listen for future edits
            google.maps.event.addListener(polygon.getPath(), "set_at", () => {
              updateAreaFromPolygon(polygon, onAreaComplete);
            });
            google.maps.event.addListener(
              polygon.getPath(),
              "insert_at",
              () => {
                updateAreaFromPolygon(polygon, onAreaComplete);
              }
            );
            google.maps.event.addListener(polygon, "dragend", () => {
              updateAreaFromPolygon(polygon, onAreaComplete);
            });
          }
        }
      );
    } else {
      // Cancel drawing mode
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
    }

    return () => {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
    };
  }, [map, drawing, isDrawing, onAreaComplete, onAreaClear]);

  return null;
}

/**
 * Extract polygon paths and update area
 */
function updateAreaFromPolygon(
  polygon: google.maps.Polygon,
  onAreaComplete: (area: MapArea) => void
) {
  const path = polygon.getPath();
  const paths: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    paths.push({ lat: point.lat(), lng: point.lng() });
  }

  if (paths.length >= 3) {
    onAreaComplete({ type: "polygon", paths });
  }
}

/**
 * Drawing Controls UI
 */
function DrawingControls({
  isDrawing,
  hasArea,
  onStartDrawing,
  onCancelDrawing,
  onClearArea,
  cinemasInArea,
  totalCinemas,
}: {
  isDrawing: boolean;
  hasArea: boolean;
  onStartDrawing: () => void;
  onCancelDrawing: () => void;
  onClearArea: () => void;
  cinemasInArea: number;
  totalCinemas: number;
}) {
  return (
    <div className="absolute top-4 left-4 right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      {/* Drawing Actions */}
      <div className="flex items-center gap-2">
        {isDrawing ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-primary text-text-inverse rounded-lg text-sm font-medium">
              <Pencil className="w-4 h-4" />
              <span>Click to draw polygon...</span>
            </div>
            <button
              onClick={onCancelDrawing}
              className="flex items-center gap-2 px-3 py-2 bg-background-primary border border-border-default rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          </>
        ) : hasArea ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-primary/10 border border-accent-primary/30 rounded-lg text-sm font-medium text-accent-primary">
              <Check className="w-4 h-4" />
              <span>Area defined</span>
            </div>
            <button
              onClick={onStartDrawing}
              className="flex items-center gap-2 px-3 py-2 bg-background-primary border border-border-default rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span>Redraw</span>
            </button>
            <button
              onClick={onClearArea}
              className="flex items-center gap-2 px-3 py-2 bg-background-primary border border-border-default rounded-lg text-sm font-medium text-text-secondary hover:text-error-text hover:bg-error-subtle transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </>
        ) : (
          <button
            onClick={onStartDrawing}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-text-inverse rounded-lg text-sm font-medium hover:bg-accent-primary-hover transition-colors shadow-sm"
          >
            <Pencil className="w-4 h-4" />
            <span>Draw area</span>
          </button>
        )}
      </div>

      {/* Cinema Count */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
          hasArea
            ? "bg-accent-primary text-text-inverse"
            : "bg-background-primary/90 border border-border-default text-text-primary"
        )}
      >
        <MapPin className="w-4 h-4" />
        <span>
          {cinemasInArea} of {totalCinemas} cinemas
          {hasArea && " in area"}
        </span>
      </div>
    </div>
  );
}
