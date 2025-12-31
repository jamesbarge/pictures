import { MetadataRoute } from "next";

const BASE_URL = "https://pictures.london";

/**
 * Robots.txt configuration for Pictures
 *
 * CRITICAL FOR GEO (Generative Engine Optimization):
 * - Explicitly allows AI crawler bots (GPTBot, Claude-Web, Google-Extended)
 * - These bots are used by ChatGPT, Claude, Gemini for real-time citations
 * - Blocking them would prevent appearing in AI-generated responses
 *
 * Blocked paths:
 * - /api/* - API endpoints (not for indexing)
 * - /sign-in, /sign-up - Auth pages (no value for SEO)
 * - /settings - User-specific content
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Default rule for all bots
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // Google's main crawler
        userAgent: "Googlebot",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // OpenAI's ChatGPT crawler (critical for GEO)
        userAgent: "GPTBot",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // OpenAI's ChatGPT user-agent for browsing
        userAgent: "ChatGPT-User",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // Anthropic's Claude crawler
        userAgent: "Claude-Web",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // Anthropic's CCBot (used for training data)
        userAgent: "CCBot",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // Google's AI crawler (for Gemini)
        userAgent: "Google-Extended",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // Perplexity AI crawler
        userAgent: "PerplexityBot",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
      {
        // Bing's crawler
        userAgent: "Bingbot",
        allow: ["/"],
        disallow: ["/api/", "/sign-in", "/sign-up", "/settings"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
