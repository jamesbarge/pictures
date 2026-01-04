"use client";

/**
 * Screening Form Modal
 * Add or edit a screening with film search, cinema selection, and datetime
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Loader2, CheckCircle, Search, Film } from "lucide-react";
import { FORMAT_OPTIONS } from "@/lib/filter-constants";
import { cn } from "@/lib/cn";
import { useDebouncedCallback } from "use-debounce";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
}

interface FilmSearchResult {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
}

interface ScreeningFormData {
  filmId: string;
  filmTitle: string; // For display
  cinemaId: string;
  datetime: string; // ISO string
  bookingUrl: string;
  format: string | null;
  screen: string | null;
  eventType: string | null;
  eventDescription: string | null;
}

interface ScreeningFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  cinemas: Cinema[];
  // If provided, we're editing; otherwise we're adding
  editData?: {
    id: string;
    filmId: string;
    filmTitle: string;
    cinemaId: string;
    datetime: string;
    bookingUrl: string;
    format: string | null;
    screen: string | null;
    eventType: string | null;
    eventDescription: string | null;
  };
}

type SaveStatus = "idle" | "saving" | "success" | "error";

const EMPTY_FORM: ScreeningFormData = {
  filmId: "",
  filmTitle: "",
  cinemaId: "",
  datetime: "",
  bookingUrl: "",
  format: null,
  screen: null,
  eventType: null,
  eventDescription: null,
};

export function ScreeningFormModal({
  isOpen,
  onClose,
  onSave,
  cinemas,
  editData,
}: ScreeningFormModalProps) {
  const isEditMode = !!editData;

  const [formData, setFormData] = useState<ScreeningFormData>(EMPTY_FORM);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Film search state
  const [filmSearch, setFilmSearch] = useState("");
  const [filmResults, setFilmResults] = useState<FilmSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilmDropdown, setShowFilmDropdown] = useState(false);

  // Initialize form when modal opens or editData changes
  useEffect(() => {
    if (!isOpen) return;

    if (editData) {
      setFormData({
        filmId: editData.filmId,
        filmTitle: editData.filmTitle,
        cinemaId: editData.cinemaId,
        datetime: editData.datetime,
        bookingUrl: editData.bookingUrl,
        format: editData.format,
        screen: editData.screen,
        eventType: editData.eventType,
        eventDescription: editData.eventDescription,
      });
      setFilmSearch(editData.filmTitle);
    } else {
      setFormData(EMPTY_FORM);
      setFilmSearch("");
    }
    setError(null);
    setSaveStatus("idle");
  }, [isOpen, editData]);

  // Debounced film search
  const searchFilms = useDebouncedCallback(async (query: string) => {
    if (query.length < 2) {
      setFilmResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/admin/films/search?q=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setFilmResults(data.films || []);
      }
    } catch {
      console.error("Film search failed");
    } finally {
      setIsSearching(false);
    }
  }, 300);

  const handleFilmSearchChange = useCallback((value: string) => {
    setFilmSearch(value);
    setShowFilmDropdown(true);
    // If user is typing, clear selected film
    if (formData.filmId && value !== formData.filmTitle) {
      setFormData(prev => ({ ...prev, filmId: "", filmTitle: "" }));
    }
    searchFilms(value);
  }, [formData.filmId, formData.filmTitle, searchFilms]);

  const selectFilm = useCallback((film: FilmSearchResult) => {
    setFormData(prev => ({
      ...prev,
      filmId: film.id,
      filmTitle: film.title,
    }));
    setFilmSearch(film.title + (film.year ? ` (${film.year})` : ""));
    setShowFilmDropdown(false);
    setFilmResults([]);
  }, []);

  async function handleSave() {
    // Validation
    if (!formData.filmId) {
      setError("Please select a film");
      return;
    }
    if (!formData.cinemaId) {
      setError("Please select a cinema");
      return;
    }
    if (!formData.datetime) {
      setError("Please set a date and time");
      return;
    }
    if (!formData.bookingUrl) {
      setError("Please provide a booking URL");
      return;
    }

    setSaveStatus("saving");
    setError(null);

    try {
      const endpoint = isEditMode
        ? `/api/admin/screenings/${editData.id}`
        : "/api/admin/screenings";

      const response = await fetch(endpoint, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId: formData.filmId,
          cinemaId: formData.cinemaId,
          datetime: formData.datetime,
          bookingUrl: formData.bookingUrl,
          format: formData.format || null,
          screen: formData.screen || null,
          eventType: formData.eventType || null,
          eventDescription: formData.eventDescription || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save screening");
      }

      setSaveStatus("success");
      onSave?.();

      // Close after brief success display
      setTimeout(() => {
        onClose();
        setSaveStatus("idle");
      }, 1000);
    } catch (err) {
      setSaveStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-lg mx-4 bg-background-primary">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div>
            <h2 className="font-medium text-text-primary">
              {isEditMode ? "Edit Screening" : "Add Screening"}
            </h2>
            <p className="text-sm text-text-secondary">
              {isEditMode ? "Update screening details" : "Create a new screening manually"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Film Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Film *
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={filmSearch}
                onChange={(e) => handleFilmSearchChange(e.target.value)}
                onFocus={() => filmResults.length > 0 && setShowFilmDropdown(true)}
                placeholder="Search for a film..."
                className={cn(
                  "w-full pl-9 pr-3 py-2 bg-background-secondary border rounded-lg text-text-primary placeholder:text-text-tertiary",
                  formData.filmId ? "border-green-500" : "border-border-subtle"
                )}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text-tertiary" />
              )}
            </div>

            {/* Film dropdown */}
            {showFilmDropdown && filmResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-background-primary border border-border-subtle rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filmResults.map((film) => (
                  <button
                    key={film.id}
                    type="button"
                    onClick={() => selectFilm(film)}
                    className="w-full px-3 py-2 text-left hover:bg-background-secondary flex items-center gap-2"
                  >
                    <Film className="w-4 h-4 text-text-tertiary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">
                        {film.title} {film.year && `(${film.year})`}
                      </div>
                      {film.directors.length > 0 && (
                        <div className="text-xs text-text-tertiary truncate">
                          {film.directors.join(", ")}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {formData.filmId && (
              <p className="text-xs text-green-600 mt-1">
                Selected: {formData.filmTitle}
              </p>
            )}
          </div>

          {/* Cinema */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Cinema *
            </label>
            <select
              value={formData.cinemaId}
              onChange={(e) => setFormData(prev => ({ ...prev, cinemaId: e.target.value }))}
              className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary"
            >
              <option value="">Select a cinema...</option>
              {cinemas.map((cinema) => (
                <option key={cinema.id} value={cinema.id}>
                  {cinema.shortName || cinema.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date/Time */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Date & Time *
            </label>
            <input
              type="datetime-local"
              value={formData.datetime ? formData.datetime.slice(0, 16) : ""}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                datetime: e.target.value ? new Date(e.target.value).toISOString() : ""
              }))}
              className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary"
            />
          </div>

          {/* Booking URL */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Booking URL *
            </label>
            <input
              type="url"
              value={formData.bookingUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, bookingUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary"
            />
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-3">
            {/* Format */}
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                Format
              </label>
              <select
                value={formData.format || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, format: e.target.value || null }))}
                className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary text-sm"
              >
                <option value="">Standard</option>
                {FORMAT_OPTIONS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Screen */}
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                Screen
              </label>
              <input
                type="text"
                value={formData.screen || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, screen: e.target.value || null }))}
                placeholder="e.g., Screen 1"
                className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary text-sm"
              />
            </div>
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Event Type (optional)
            </label>
            <select
              value={formData.eventType || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, eventType: e.target.value || null }))}
              className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary text-sm"
            >
              <option value="">Regular Screening</option>
              <option value="q_and_a">Q&A</option>
              <option value="preview">Preview</option>
              <option value="premiere">Premiere</option>
              <option value="special_event">Special Event</option>
              <option value="marathon">Marathon</option>
              <option value="double_bill">Double Bill</option>
            </select>
          </div>

          {/* Event Description */}
          {formData.eventType && (
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                Event Description
              </label>
              <textarea
                value={formData.eventDescription || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, eventDescription: e.target.value || null }))}
                placeholder="Details about the event..."
                rows={2}
                className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary resize-none text-sm"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saveStatus === "saving" || saveStatus === "success"}
          >
            {saveStatus === "saving" && (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Saving...
              </>
            )}
            {saveStatus === "success" && (
              <>
                <CheckCircle className="w-4 h-4 mr-1" />
                Saved
              </>
            )}
            {(saveStatus === "idle" || saveStatus === "error") && (
              isEditMode ? "Save Changes" : "Add Screening"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
