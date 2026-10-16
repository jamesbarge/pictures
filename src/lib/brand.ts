/**
 * Brand Configuration — Single Source of Truth
 *
 * All brand-specific values live here so a rebrand becomes a one-file change.
 * Design tokens (colors, spacing, radii) remain in globals.css;
 * this file covers identity: domain, hex literals used in code, and palette.
 */

export const brand = {
  baseUrl: "https://pictures.london",

  colors: {
    /** criterion-blue — Clerk primary */
    primary: "#1E3A5F",
    /** charcoal — Clerk text */
    text: "#1A1A1A",
    /** Clerk secondary text */
    textSecondary: "#4A4A4A",
    /** Clerk input background */
    inputBackground: "#EDE8DD",
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
