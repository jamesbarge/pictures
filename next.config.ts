import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

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
      {
        protocol: "https",
        hostname: "player.bfi.org.uk",
      },
      {
        protocol: "https",
        hostname: "d13jj08vfqimqg.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "ticketlab.co.uk",
      },
    ],
  },
  // Security headers — CSP, HSTS, clickjacking protection, etc.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://image.tmdb.org https://images.savoysystems.co.uk https://player.bfi.org.uk https://d13jj08vfqimqg.cloudfront.net https://ticketlab.co.uk https://img.clerk.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.clerk.accounts.dev https://clerk.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://maps.googleapis.com",
              "frame-src https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
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
