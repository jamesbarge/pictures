/**
 * Film Not Found Page
 */

import Link from "next/link";
import { Film, ChevronLeft } from "lucide-react";

export default function FilmNotFound() {
  return (
    <div className="min-h-screen bg-background-primary flex flex-col items-center justify-center px-4">
      <Film className="w-16 h-16 text-text-tertiary mb-6" />

      <h1 className="font-display text-2xl text-text-primary mb-2">
        Film Not Found
      </h1>

      <p className="text-text-secondary text-center max-w-sm mb-8">
        The film you're looking for doesn't exist or may have been removed.
      </p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Calendar
      </Link>
    </div>
  );
}
