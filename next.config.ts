import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Increase timeout for ISR static generation (querying 3000 screenings)
  staticPageGenerationTimeout: 120,
  // Fix Turbopack root detection (stray lockfile in home directory)
  turbopack: {
    root: __dirname,
  },
  // Exclude Playwright/Puppeteer from webpack bundling (used by scrapers via Inngest)
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin",
    "puppeteer-extra-plugin-stealth",
    "clone-deep",
    "merge-deep",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "images.savoysystems.co.uk",
      },
    ],
  },
  // Reverse proxy for PostHog to avoid ad blockers
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://eu.i.posthog.com/decide",
      },
    ];
  },
};

export default nextConfig;
