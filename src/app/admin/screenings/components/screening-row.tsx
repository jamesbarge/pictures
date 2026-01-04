"use client";

/**
 * Screening Row with Edit Button
 * Client component to handle edit modal state
 */

import { useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Pencil } from "lucide-react";
import { ScreeningFormModal } from "./screening-form-modal";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
}

interface ScreeningRowProps {
  screening: {
    id: string;
    datetime: string; // Serialized from server
    format: string | null;
    screen: string | null;
    eventType: string | null;
    eventDescription: string | null;
    bookingUrl: string | null;
    film: {
      id: string;
      title: string;
      year: number | null;
      posterUrl: string | null;
    };
    cinema: {
      id: string;
      name: string;
      shortName: string | null;
    };
  };
  cinemas: Cinema[];
}

export function ScreeningRow({ screening, cinemas }: ScreeningRowProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const datetime = new Date(screening.datetime);

  return (
    <>
      <Card padding="sm" className="hover:border-border-default transition-colors">
        <div className="flex items-center gap-4">
          {/* Poster thumbnail */}
          <div className="w-12 h-16 bg-background-tertiary rounded overflow-hidden shrink-0">
            {screening.film.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={screening.film.posterUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="font-medium text-text-primary truncate">
                {screening.film.title}
              </h3>
              {screening.film.year && (
                <span className="text-sm text-text-tertiary">
                  ({screening.film.year})
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-text-secondary">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(datetime, "EEE d MMM, HH:mm")}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {screening.cinema.shortName || screening.cinema.name}
              </span>
              {screening.format && (
                <span className="text-xs px-1.5 py-0.5 bg-background-tertiary rounded">
                  {screening.format}
                </span>
              )}
              {screening.eventType && screening.eventType !== "standard" && (
                <span className="text-xs px-1.5 py-0.5 bg-accent-primary/10 text-accent-primary rounded">
                  {screening.eventType}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {screening.bookingUrl && (
              <a
                href={screening.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-text-tertiary hover:text-text-primary"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(true)}
            >
              <Pencil className="w-4 h-4 mr-1" />
              Edit
            </Button>
          </div>
        </div>
      </Card>

      <ScreeningFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => {
          window.location.reload();
        }}
        cinemas={cinemas}
        editData={{
          id: screening.id,
          filmId: screening.film.id,
          filmTitle: screening.film.title,
          cinemaId: screening.cinema.id,
          datetime: screening.datetime,
          bookingUrl: screening.bookingUrl || "",
          format: screening.format,
          screen: screening.screen,
          eventType: screening.eventType,
          eventDescription: screening.eventDescription,
        }}
      />
    </>
  );
}
