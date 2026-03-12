/**
 * Brand Configuration — Single Source of Truth
 *
 * All brand-specific values live here so a rebrand becomes a one-file change.
 * Design tokens (colors, spacing, radii) remain in globals.css;
 * this file covers identity: name, domain, hex literals used in code, and palette.
 */

export const brand = {
  name: "Pictures",
  shortName: "Pictures",
  /** SEO-oriented tagline used in page titles */
  tagline: "London Cinema Listings | Showtimes | Festivals",
  /** Shorter name used in PWA manifest (visible on home screen / app switcher) */
  pwaName: "Pictures - London Cinema Listings",
  description:
    "Find screenings at London cinemas. Daily updated listings from BFI Southbank, Prince Charles Cinema, Curzon, Picturehouse, ICA, Barbican, and 20+ venues.",
  domain: "pictures.london",
  baseUrl: "https://pictures.london",
  email: "hello@pictures.london",

  social: {
    twitter: "@pictureslondon",
  },

  colors: {
    /** criterion-blue — used as Clerk primary, viewport themeColor, PWA theme */
    primary: "#1E3A5F",
    /** warm cream — PWA background */
    background: "#F7F4ED",
    /** charcoal — Clerk text */
    text: "#1A1A1A",
    /** Clerk secondary text */
    textSecondary: "#4A4A4A",
    /** Clerk input background */
    inputBackground: "#EDE8DD",
    /** indigo — Google Maps polygon/marker color */
    mapMarker: "#6366f1",
  },

  /** Cinema-inspired palette for poster placeholders (prussian blue, jasmine, teal, reds) */
  placeholderPalette: [
    { bg: "#001427", accent: "#f4d58d" }, // Prussian blue + jasmine
    { bg: "#0a2235", accent: "#94b3a8" }, // Darker blue + teal
    { bg: "#001427", accent: "#bf0603" }, // Prussian blue + brick ember
    { bg: "#143044", accent: "#f4d58d" }, // Lighter blue + jasmine
    { bg: "#0a2235", accent: "#f7e0a8" }, // Blue + light gold
    { bg: "#001427", accent: "#8d0801" }, // Prussian blue + blood red
  ],
} as const;
