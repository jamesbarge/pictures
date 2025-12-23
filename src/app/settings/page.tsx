/**
 * Settings Page
 * Allows users to select their preferred cinemas and configure preferences
 */

import { db } from "@/db";
import { cinemas } from "@/db/schema";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CinemaSelector } from "@/components/cinema/cinema-selector";
import { NotInterestedList } from "@/components/settings/not-interested-list";

export default async function SettingsPage() {
  // Fetch all cinemas
  const allCinemas = await db.select().from(cinemas).orderBy(cinemas.name);

  return (
    <div className="min-h-screen bg-background-primary pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display text-text-primary mb-2">Settings</h1>
        <p className="text-text-secondary mb-8">
          Customize your Postboxd experience
        </p>

        {/* Cinema Selection Section */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            My Cinemas
          </h2>
          <p className="text-text-secondary text-sm mb-6">
            Select the cinemas you want to see screenings from. Your selection
            syncs with the cinema filter in the header.
          </p>

          <CinemaSelector cinemas={allCinemas} />
        </section>

        {/* Not Interested Section */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Hidden Films
          </h2>
          <p className="text-text-secondary text-sm mb-6">
            Films you've marked as "not interested" are hidden from the calendar.
            Restore them here to see their screenings again.
          </p>

          <NotInterestedList />
        </section>
      </div>
    </div>
  );
}

export const metadata = {
  title: "Settings | Postboxd",
  description: "Customize your Postboxd experience",
};
