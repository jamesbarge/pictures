/**
 * Letterboxd Import Trigger Button
 * Small toggle button to show/hide the Letterboxd import panel.
 * Fits alongside the sort controls in the watchlist view.
 */

"use client";

import { Film } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

interface LetterboxdImportTriggerProps {
  onToggle: () => void;
  isOpen: boolean;
}

export function LetterboxdImportTrigger({
  onToggle,
  isOpen,
}: LetterboxdImportTriggerProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onToggle}
      className={cn(
        isOpen && "border-accent-primary/50 bg-accent-primary/10 text-accent-primary"
      )}
      leftIcon={<Film className="w-4 h-4" aria-hidden="true" />}
      aria-label="Import from Letterboxd"
      aria-expanded={isOpen}
    >
      <span className="hidden sm:inline">Import from Letterboxd</span>
    </Button>
  );
}
