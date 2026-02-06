/**
 * Cinema Directory Page
 * Lists all London independent cinemas covered by Pictures
 * Optimized for local SEO and GEO with ItemList schema
 */

import { Metadata } from "next";
import Link from "next/link";
import { MapPin, ExternalLink, Film } from "lucide-react";
import { db } from "@/db";
import { cinemas, screenings } from "@/db/schema";
import { eq, gte, count, and } from "drizzle-orm";
import {
  ItemListSchema,
  FAQSchema,
  BreadcrumbSchema,
} from "@/components/seo/json-ld";

export const dynamic = "force-dynamic"; // Avoid build timeout on DB connection

const BASE_URL = "https://pictures.london";

export const metadata: Metadata = {
  title: "London Cinemas - Complete Directory",
  description:
    "Directory of 20+ cinemas in London. Find art house, repertory, mainstream, and indie film venues including BFI Southbank, Prince Charles Cinema, Curzon, Picturehouse, Odeon, and more.",
  alternates: {
    canonical: "/cinemas",
  },
  openGraph: {
    title: "London Cinemas - Complete Directory",
    description:
      "Find London's best cinemas. Art house, repertory, mainstream, and indie film venues with daily updated listings.",
    url: `${BASE_URL}/cinemas`,
    type: "website",
  },
};

export default async function CinemasPage() {
  const now = new Date();

  // Fetch all active cinemas with screening counts in a single query
  // Uses LEFT JOIN to include cinemas with zero screenings
  const cinemasWithStats = await db
    .select({
      id: cinemas.id,
      name: cinemas.name,
      shortName: cinemas.shortName,
      chain: cinemas.chain,
      address: cinemas.address,
      screens: cinemas.screens,
      features: cinemas.features,
      programmingFocus: cinemas.programmingFocus,
      website: cinemas.website,
      description: cinemas.description,
      // Count upcoming screenings - LEFT JOIN means we get 0 for cinemas with no screenings
      screeningCount: count(screenings.id),
    })
    .from(cinemas)
    .leftJoin(
      screenings,
      and(
        eq(screenings.cinemaId, cinemas.id),
        gte(screenings.datetime, now)
      )
    )
    .where(eq(cinemas.isActive, true))
    .groupBy(cinemas.id)
    .orderBy(cinemas.name);

  // ItemList schema for search engines
  const listItems = cinemasWithStats.map((cinema, index) => ({
    name: cinema.name,
    url: `/cinemas/${cinema.id}`,
    position: index + 1,
  }));

  // FAQ items for GEO
  const faqItems = [
    {
      question: "What cinemas are in London?",
      answer: `London has ${cinemasWithStats.length} major cinemas including ${cinemasWithStats
        .slice(0, 5)
        .map((c) => c.name)
        .join(", ")}, and more. These venues show everything from blockbusters to art house, repertory, and independent films.`,
    },
    {
      question: "What is the best cinema in London?",
      answer:
        "London's top cinemas include BFI Southbank (the UK's leading film institution), Prince Charles Cinema (known for repertory and cult films), and the ICA Cinema (experimental and art house). The best choice depends on your taste in films.",
    },
    {
      question: "Where can I watch classic films in London?",
      answer:
        "For classic and repertory films, visit BFI Southbank, Prince Charles Cinema, or The Garden Cinema. These venues regularly screen restored classics, cult favourites, and retrospectives.",
    },
  ];

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Cinemas", url: "/cinemas" },
  ];

  // Calculate total screenings
  const totalScreenings = cinemasWithStats.reduce(
    (sum, c) => sum + c.screeningCount,
    0
  );

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <ItemListSchema
        name="London Cinemas"
        description="Complete directory of cinemas in London"
        items={listItems}
      />
      <FAQSchema items={faqItems} />
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Header */}
      <div className="bg-background-secondary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Breadcrumb nav */}
          <nav className="text-sm text-text-tertiary mb-4">
            <Link href="/" className="hover:text-text-primary">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-text-primary">Cinemas</span>
          </nav>

          {/* H1 - critical for SEO */}
          <h1 className="text-3xl font-display text-text-primary mb-4">
            London Cinemas
          </h1>

          {/* Answer-first summary for GEO */}
          <p className="text-text-secondary max-w-2xl">
            Discover {cinemasWithStats.length} cinemas across London. Currently
            showing {totalScreenings} upcoming screenings from blockbusters to
            art house, repertory, and independent films. Updated daily.
          </p>
        </div>
      </div>

      {/* Cinema Grid */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <div className="grid gap-4">
          {cinemasWithStats.map((cinema) => (
            <Link
              key={cinema.id}
              href={`/cinemas/${cinema.id}`}
              className="block bg-background-secondary border border-border-subtle rounded-lg p-6 hover:border-border-default transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="text-xl font-display text-text-primary mb-1">
                    {cinema.name}
                  </h2>

                  {cinema.address && (
                    <p className="text-sm text-text-secondary flex items-center gap-1 mb-2">
                      <MapPin className="w-4 h-4" />
                      {cinema.address.area}, {cinema.address.postcode}
                    </p>
                  )}

                  {cinema.description && (
                    <p className="text-sm text-text-tertiary line-clamp-2 mb-3">
                      {cinema.description}
                    </p>
                  )}

                  {/* Features/Focus */}
                  <div className="flex flex-wrap gap-2">
                    {cinema.programmingFocus.slice(0, 3).map((focus) => (
                      <span
                        key={focus}
                        className="text-xs px-2 py-1 bg-background-tertiary rounded text-text-secondary"
                      >
                        {focus}
                      </span>
                    ))}
                    {cinema.screens && (
                      <span className="text-xs px-2 py-1 bg-background-tertiary rounded text-text-secondary">
                        {cinema.screens} screen{cinema.screens !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right ml-4">
                  <div className="flex items-center gap-1 text-text-secondary">
                    <Film className="w-4 h-4" />
                    <span className="text-sm font-mono">
                      {cinema.screeningCount}
                    </span>
                  </div>
                  <p className="text-xs text-text-tertiary">screenings</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto px-4 mt-12">
        <h2 className="text-xl font-display text-text-primary mb-6">
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
      </div>

      {/* External link */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <p className="text-sm text-text-tertiary flex items-center gap-1">
          <ExternalLink className="w-4 h-4" />
          Visit each cinema&apos;s website for booking and more details.
        </p>
      </div>
    </div>
  );
}
