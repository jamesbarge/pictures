/**
 * About Page
 * Describes Postboxd and lists covered cinemas
 * Important for E-E-A-T signals and AI citations
 */

import { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Film, Calendar, MapPin, ExternalLink } from "lucide-react";
import { db } from "@/db";
import { cinemas, screenings, films } from "@/db/schema";
import { eq, gte, count, countDistinct } from "drizzle-orm";
import { OrganizationSchema, FAQSchema, BreadcrumbSchema } from "@/components/seo/json-ld";

export const revalidate = 3600; // Revalidate hourly

const BASE_URL = "https://pictures.london";

export const metadata: Metadata = {
  title: "About Pictures - London Cinema Calendar",
  description:
    "Pictures aggregates film listings from 20+ independent London cinemas into one calendar. Find screenings at BFI, Prince Charles, Curzon, Picturehouse, and more.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Pictures - London Cinema Calendar",
    description:
      "The definitive cinema calendar for London cinephiles. Updated daily with listings from independent venues.",
    url: `${BASE_URL}/about`,
    type: "website",
  },
};

export default async function AboutPage() {
  const now = new Date();

  // Fetch stats
  const [allCinemas, statsResult] = await Promise.all([
    db
      .select({
        id: cinemas.id,
        name: cinemas.name,
        chain: cinemas.chain,
        address: cinemas.address,
        programmingFocus: cinemas.programmingFocus,
      })
      .from(cinemas)
      .where(eq(cinemas.isActive, true))
      .orderBy(cinemas.name),
    db
      .select({
        totalScreenings: count(screenings.id),
        uniqueFilms: countDistinct(screenings.filmId),
      })
      .from(screenings)
      .where(gte(screenings.datetime, now)),
  ]);

  const stats = {
    cinemaCount: allCinemas.length,
    totalScreenings: statsResult[0]?.totalScreenings || 0,
    uniqueFilms: statsResult[0]?.uniqueFilms || 0,
  };

  // FAQ items
  const faqItems = [
    {
      question: "What is Pictures?",
      answer: `Pictures is a cinema calendar that aggregates film listings from ${stats.cinemaCount} independent London cinemas. We update daily with the latest showtimes from venues like BFI Southbank, Prince Charles Cinema, Curzon, and more.`,
    },
    {
      question: "Which cinemas does Pictures cover?",
      answer: `We cover ${stats.cinemaCount} independent cinemas including ${allCinemas
        .slice(0, 6)
        .map((c) => c.name)
        .join(", ")}, and more.`,
    },
    {
      question: "How often is Pictures updated?",
      answer:
        "Pictures updates daily, scraping the latest listings from each cinema. Screenings are typically available 2-4 weeks in advance.",
    },
    {
      question: "Is Pictures free to use?",
      answer:
        "Yes, Pictures is completely free. We aggregate listings to help film lovers discover screenings across London's independent cinema scene.",
    },
  ];

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "About", url: "/about" },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <OrganizationSchema />
      <FAQSchema items={faqItems} />
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-3">
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <h1 className="text-3xl font-display text-text-primary mb-4">
          About Pictures
        </h1>

        {/* Answer-first summary */}
        <p className="text-lg text-text-secondary mb-8">
          Pictures is the definitive cinema calendar for London cinephiles. We
          aggregate listings from {stats.cinemaCount} independent cinemas into
          one unified view, helping you discover screenings you might otherwise
          miss.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="bg-background-secondary rounded-lg p-4 text-center">
            <div className="text-2xl font-mono text-text-primary">
              {stats.cinemaCount}
            </div>
            <div className="text-sm text-text-tertiary flex items-center justify-center gap-1">
              <MapPin className="w-4 h-4" />
              Cinemas
            </div>
          </div>
          <div className="bg-background-secondary rounded-lg p-4 text-center">
            <div className="text-2xl font-mono text-text-primary">
              {stats.uniqueFilms}
            </div>
            <div className="text-sm text-text-tertiary flex items-center justify-center gap-1">
              <Film className="w-4 h-4" />
              Films
            </div>
          </div>
          <div className="bg-background-secondary rounded-lg p-4 text-center">
            <div className="text-2xl font-mono text-text-primary">
              {stats.totalScreenings}
            </div>
            <div className="text-sm text-text-tertiary flex items-center justify-center gap-1">
              <Calendar className="w-4 h-4" />
              Screenings
            </div>
          </div>
        </div>

        {/* What we do */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            What We Do
          </h2>
          <div className="space-y-4 text-text-secondary">
            <p>
              London has an incredible independent cinema scene, but finding
              what&apos;s showing across different venues can be frustrating.
              Each cinema has its own website, its own calendar, its own way of
              presenting information.
            </p>
            <p>
              Pictures solves this by aggregating listings from {stats.cinemaCount}{" "}
              cinemas into one searchable, filterable calendar. Whether
              you&apos;re looking for a specific film, browsing repertory
              screenings, or just seeing what&apos;s on near you tonight, we make
              it simple.
            </p>
            <p>
              We update daily, pulling the latest listings from each cinema. Our
              data includes film details from TMDB, making it easy to learn about
              films before you book.
            </p>
          </div>
        </section>

        {/* Cinemas we cover */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Cinemas We Cover
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {allCinemas.map((cinema) => (
              <Link
                key={cinema.id}
                href={`/cinemas/${cinema.id}`}
                className="flex items-center justify-between bg-background-secondary rounded-lg px-4 py-3 hover:bg-background-tertiary transition-colors"
              >
                <div>
                  <div className="font-medium text-text-primary">
                    {cinema.name}
                  </div>
                  {cinema.address && (
                    <div className="text-xs text-text-tertiary">
                      {cinema.address.area}
                    </div>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-text-tertiary" />
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {faqItems.map((faq, index) => (
              <div key={index} className="border-b border-border-subtle pb-4">
                <h3 className="font-medium text-text-primary mb-2">
                  {faq.question}
                </h3>
                <p className="text-text-secondary text-sm">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Data Sources
          </h2>
          <p className="text-text-secondary text-sm">
            Film metadata is provided by{" "}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary hover:underline"
            >
              The Movie Database (TMDB)
            </a>
            . Screening times are sourced directly from each cinema&apos;s
            website. While we strive for accuracy, always verify showtimes on the
            cinema&apos;s official site before booking.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-xl font-display text-text-primary mb-4">
            Contact
          </h2>
          <p className="text-text-secondary text-sm">
            Questions, feedback, or suggestions? Get in touch at{" "}
            <a
              href="mailto:jdwbarge@gmail.com"
              className="text-accent-primary hover:underline"
            >
              jdwbarge@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
