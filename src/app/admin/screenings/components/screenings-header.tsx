"use client";

/**
 * Screenings Header with Add Button
 * Client component to handle modal state
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ScreeningFormModal } from "./screening-form-modal";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
}

interface ScreeningsHeaderProps {
  cinemas: Cinema[];
}

export function ScreeningsHeader({ cinemas }: ScreeningsHeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Screenings</h1>
          <p className="text-text-secondary mt-1">
            Browse and manage all screenings
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Screening
        </Button>
      </div>

      <ScreeningFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => {
          // Refresh the page to show new screening
          window.location.reload();
        }}
        cinemas={cinemas}
      />
    </>
  );
}
