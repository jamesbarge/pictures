/**
 * Site Footer
 * Contains legal links, contact info, and attribution
 */

import Link from "next/link";

const CONTACT_EMAIL = "jdwbarge@gmail.com";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border-subtle bg-background-secondary/50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Copyright */}
          <p className="text-sm text-text-tertiary">
            &copy; {currentYear} Pictures
          </p>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="/about"
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              Terms
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              Contact
            </a>
          </nav>

          {/* Attribution */}
          <p className="text-xs text-text-tertiary">
            Film data from{" "}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-secondary transition-colors"
            >
              TMDB
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
