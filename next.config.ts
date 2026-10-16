import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Fix Turbopack root detection (stray lockfile in home directory)
  turbopack: {
    root: __dirname,
  },
  // Exclude Playwright wrappers from webpack bundling — they ship their own
  // copies of playwright-core, and webpack will otherwise try to recurse into
  // their .ttf/.html/electron assets. playwright-extra and puppeteer-extra-*
  // were dropped 2026-05-03.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "rebrowser-playwright",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
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
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.clerk.accounts.dev https://clerk.pictures.london https://challenges.cloudflare.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://image.tmdb.org https://images.savoysystems.co.uk https://player.bfi.org.uk https://d13jj08vfqimqg.cloudfront.net https://ticketlab.co.uk https://img.clerk.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.clerk.accounts.dev https://clerk.pictures.london https://clerk.com",
              "frame-src https://*.clerk.accounts.dev https://clerk.pictures.london https://challenges.cloudflare.com",
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
  // pictures.london (frontend/) is the public site. This app keeps the API,
  // admin and Clerk sign-in, and sends every legacy page URL there.
  async redirects() {
    return [
      // SvelteKit has no page for these three; send them to the nearest parent.
      { source: "/cinemas/:slug/tonight", destination: "https://pictures.london/cinemas/:slug", permanent: true },
      { source: "/directors/:id", destination: "https://pictures.london/directors", permanent: true },
      { source: "/seasons/:slug", destination: "https://pictures.london/seasons", permanent: true },
      {
        source: "/:path((?!api/|admin|sign-in|_next/|robots\\.txt|favicon\\.ico|google7ea8fa19954d5e86\\.html).*)",
        destination: "https://pictures.london/:path",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
