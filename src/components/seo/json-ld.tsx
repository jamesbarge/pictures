import Script from "next/script";
import type { Film } from "@/types/film";
import type { Cinema } from "@/types/cinema";
import type { Screening } from "@/types/screening";
import type { FestivalSelect } from "@/db/schema/festivals";

const BASE_URL = "https://postboxd.co.uk";

/**
 * JSON-LD Schema Components for SEO and GEO
 *
 * These structured data components help search engines and AI systems
 * understand the content on each page. Research shows:
 * - FAQ schema increases AI citations by 28%
 * - Proper Movie/Event schema enables rich snippets
 * - Organization schema builds brand authority
 *
 * Uses Next.js Script component for safe JSON-LD injection
 */

interface JsonLdProps {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Safe JSON-LD component using Next.js Script
 * The data is serialized server-side and embedded safely
 */
function JsonLd({ id, data }: JsonLdProps) {
  // Serialize to JSON string - JSON.stringify handles escaping
  const jsonString = JSON.stringify(data);

  return (
    <Script
      id={id}
      type="application/ld+json"
      strategy="afterInteractive"
    >
      {jsonString}
    </Script>
  );
}

/**
 * Organization schema for Postboxd brand
 * Used in root layout
 */
export function OrganizationSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Postboxd",
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description:
      "The definitive cinema calendar for London cinephiles. Find screenings at independent cinemas including BFI Southbank, Prince Charles Cinema, ICA, and more.",
    sameAs: [],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      url: `${BASE_URL}/about`,
    },
  };

  return <JsonLd id="organization-schema" data={data} />;
}

/**
 * WebSite schema with SearchAction for sitelinks searchbox
 * Used on home page
 */
export function WebSiteSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Postboxd",
    alternateName: "Postboxd London Cinema Calendar",
    url: BASE_URL,
    description:
      "Find and track film screenings at London's independent cinemas. Updated daily with showtimes from BFI, Prince Charles, Curzon, Picturehouse, and more.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return <JsonLd id="website-schema" data={data} />;
}

/**
 * Movie schema for individual film pages
 * Follows Google's Movie structured data guidelines
 */
export function MovieSchema({ film }: { film: Film }) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: film.title,
    url: `${BASE_URL}/film/${film.id}`,
    dateCreated: film.year ? `${film.year}` : undefined,
    description: film.synopsis || `${film.title} (${film.year || "N/A"})`,
    genre: film.genres,
    director: film.directors.map((name) => ({
      "@type": "Person",
      name,
    })),
    actor: film.cast.slice(0, 10).map((member) => ({
      "@type": "Person",
      name: member.name,
    })),
  };

  if (film.posterUrl) {
    data.image = film.posterUrl;
  }

  if (film.runtime) {
    data.duration = `PT${film.runtime}M`;
  }

  if (film.certification) {
    data.contentRating = film.certification;
  }

  if (film.tmdbRating) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: film.tmdbRating.toFixed(1),
      bestRating: "10",
      worstRating: "0",
      ratingCount: 1000,
    };
  }

  if (film.countries.length > 0) {
    data.countryOfOrigin = film.countries.map((country) => ({
      "@type": "Country",
      name: country,
    }));
  }

  const sameAs: string[] = [];
  if (film.imdbId) {
    sameAs.push(`https://www.imdb.com/title/${film.imdbId}/`);
  }
  if (film.tmdbId) {
    sameAs.push(`https://www.themoviedb.org/movie/${film.tmdbId}`);
  }
  if (film.letterboxdUrl) {
    sameAs.push(film.letterboxdUrl);
  }
  if (sameAs.length > 0) {
    data.sameAs = sameAs;
  }

  return <JsonLd id={`movie-schema-${film.id}`} data={data} />;
}

/**
 * ScreeningEvent schema for individual screenings
 * Used on film pages to mark up each showtime
 */
export function ScreeningEventSchema({
  screening,
  film,
  cinema,
}: {
  screening: Screening;
  film: { title: string; posterUrl?: string | null };
  cinema: Cinema;
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ScreeningEvent",
    name: `${film.title} at ${cinema.name}`,
    startDate: screening.datetime.toISOString(),
    endDate: new Date(
      screening.datetime.getTime() + 90 * 60 * 1000
    ).toISOString(),
    location: {
      "@type": "MovieTheater",
      name: cinema.name,
      url: cinema.website,
      address: cinema.address
        ? {
            "@type": "PostalAddress",
            streetAddress: cinema.address.street,
            addressLocality: cinema.address.area,
            postalCode: cinema.address.postcode,
            addressRegion: cinema.address.borough,
            addressCountry: "GB",
          }
        : undefined,
    },
    workPresented: {
      "@type": "Movie",
      name: film.title,
      image: film.posterUrl,
    },
    url: screening.bookingUrl,
    eventStatus: screening.isSoldOut
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  };

  if (screening.format && screening.format !== "unknown") {
    data.videoFormat = screening.format.toUpperCase();
  }

  data.offers = {
    "@type": "Offer",
    url: screening.bookingUrl,
    availability: screening.isSoldOut
      ? "https://schema.org/SoldOut"
      : "https://schema.org/InStock",
    priceCurrency: "GBP",
  };

  return <JsonLd id={`screening-schema-${screening.id}`} data={data} />;
}

/**
 * Multiple ScreeningEvents for film pages
 * Limits to first 10 to avoid huge schema
 */
export function ScreeningEventsSchema({
  screenings,
  film,
  cinemas,
}: {
  screenings: Screening[];
  film: { title: string; posterUrl?: string | null };
  cinemas: Map<string, Cinema>;
}) {
  const limitedScreenings = screenings.slice(0, 10);

  return (
    <>
      {limitedScreenings.map((screening) => {
        const cinema = cinemas.get(screening.cinemaId);
        if (!cinema) return null;
        return (
          <ScreeningEventSchema
            key={screening.id}
            screening={screening}
            film={film}
            cinema={cinema}
          />
        );
      })}
    </>
  );
}

/**
 * MovieTheater schema for cinema pages
 * Important for local SEO
 */
export function MovieTheaterSchema({ cinema }: { cinema: Cinema }) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MovieTheater",
    name: cinema.name,
    url: `${BASE_URL}/cinemas/${cinema.id}`,
    description:
      cinema.description ||
      `${cinema.name} is an independent cinema in London.`,
  };

  if (cinema.address) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: cinema.address.street,
      addressLocality: cinema.address.area,
      postalCode: cinema.address.postcode,
      addressRegion: cinema.address.borough,
      addressCountry: "GB",
    };
  }

  if (cinema.coordinates) {
    data.geo = {
      "@type": "GeoCoordinates",
      latitude: cinema.coordinates.lat,
      longitude: cinema.coordinates.lng,
    };
  }

  if (cinema.screens) {
    data.screenCount = cinema.screens;
  }

  if (cinema.website) {
    data.sameAs = [cinema.website];
  }

  if (cinema.imageUrl) {
    data.image = cinema.imageUrl;
  }

  return <JsonLd id={`theater-schema-${cinema.id}`} data={data} />;
}

/**
 * BreadcrumbList schema for navigation
 * Improves search appearance with breadcrumb trails
 */
interface BreadcrumbItem {
  name: string;
  url: string;
}

export function BreadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  };

  return <JsonLd id="breadcrumb-schema" data={data} />;
}

/**
 * FAQPage schema for FAQ sections
 * Research shows 28% increase in AI citations with FAQ schema
 */
interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSchema({ items }: { items: FAQItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return <JsonLd id="faq-schema" data={data} />;
}

/**
 * Festival/Event schema for festival pages
 */
export function FestivalSchema({ festival }: { festival: FestivalSelect }) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Festival",
    name: festival.name,
    url: `${BASE_URL}/festivals/${festival.slug}`,
    description: festival.description || `${festival.name} film festival`,
    startDate: festival.startDate,
    endDate: festival.endDate,
    location: {
      "@type": "City",
      name: "London",
      addressCountry: "GB",
    },
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
  };

  if (festival.websiteUrl) {
    data.sameAs = [festival.websiteUrl];
  }

  if (festival.logoUrl) {
    data.image = festival.logoUrl;
  }

  return <JsonLd id={`festival-schema-${festival.slug}`} data={data} />;
}

/**
 * ItemList schema for listing pages
 * Good for cinema directory, film lists, etc.
 */
export function ItemListSchema({
  name,
  description,
  items,
}: {
  name: string;
  description: string;
  items: { name: string; url: string; position: number }[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: items.length,
    itemListElement: items.map((item) => ({
      "@type": "ListItem",
      position: item.position,
      name: item.name,
      url: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  };

  return <JsonLd id="item-list-schema" data={data} />;
}
