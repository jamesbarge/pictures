/**
 * Booking Link Checker
 * Tests that booking URLs resolve and point to the correct cinema.
 *
 * Checks:
 * - Booking URLs return 200/301/302 (not 404/500)
 * - Domain matches expected cinema chain booking system
 */

import type { AuditIssue } from "../types";

/** Known cinema chain booking domains */
const CINEMA_BOOKING_DOMAINS: Record<string, string[]> = {
  curzon: ["curzon.com", "curzoncinemas.com"],
  picturehouse: ["picturehouses.com", "picturehouses.co.uk"],
  everyman: ["everymancinema.com"],
  bfi: ["bfi.org.uk", "whatson.bfi.org.uk"],
};

/** Map cinema slugs to expected domains */
const CINEMA_DOMAIN_MAP: Record<string, string[]> = {
  // BFI venues
  "bfi-southbank": ["bfi.org.uk"],
  "bfi-imax": ["bfi.org.uk"],
  // Curzon venues
  "curzon-soho": ["curzon.com"],
  "curzon-mayfair": ["curzon.com"],
  "curzon-bloomsbury": ["curzon.com"],
  "curzon-aldgate": ["curzon.com"],
  "curzon-victoria": ["curzon.com"],
  "curzon-hoxton": ["curzon.com"],
  "curzon-kingston": ["curzon.com"],
  // Picturehouse venues
  "picturehouse-central": ["picturehouses.com"],
  "picturehouse-hackney": ["picturehouses.com"],
  "picturehouse-crouch-end": ["picturehouses.com"],
  "picturehouse-east-dulwich": ["picturehouses.com"],
  "picturehouse-greenwich": ["picturehouses.com"],
  "picturehouse-finsbury-park": ["picturehouses.com"],
  "gate-notting-hill": ["picturehouses.com"],
  "ritzy-brixton": ["picturehouses.com"],
  "picturehouse-clapham": ["picturehouses.com"],
  "picturehouse-west-norwood": ["picturehouses.com"],
  "picturehouse-ealing": ["picturehouses.com"],
  // Everyman venues
  "everyman-baker-street": ["everymancinema.com"],
  "everyman-barnet": ["everymancinema.com"],
  "everyman-belsize-park": ["everymancinema.com"],
  "everyman-borough-yards": ["everymancinema.com"],
  "everyman-broadgate": ["everymancinema.com"],
  "everyman-canary-wharf": ["everymancinema.com"],
  "everyman-chelsea": ["everymancinema.com"],
  "everyman-crystal-palace": ["everymancinema.com"],
  "everyman-hampstead": ["everymancinema.com"],
  "everyman-kings-cross": ["everymancinema.com"],
  "everyman-maida-vale": ["everymancinema.com"],
  "everyman-muswell-hill": ["everymancinema.com"],
  "screen-on-the-green": ["everymancinema.com"],
  "everyman-stratford": ["everymancinema.com"],
  "everyman-walthamstow": ["everymancinema.com"],
  // Independents — diverse booking domains
  "prince-charles": ["princecharlescinema.com"],
  "rio-dalston": ["riocinema.org.uk"],
  "ica": ["ica.art"],
  "barbican": ["barbican.org.uk"],
  "genesis": ["genesiscinema.co.uk"],
  "peckhamplex": ["peckhamplex.london"],
  "the-nickel": ["thenickel.london", "thenickel.co.uk", "book.thenickel.co.uk"],
  "garden": ["thegardencinema.co.uk"],
  "castle": ["castlecinema.com", "thecastlecinema.com"],
  "phoenix-east-finchley": ["phoenixcinema.co.uk"],
  "rich-mix": ["richmix.org.uk"],
  "close-up-cinema": ["closeupfilmcentre.com"],
  "cine-lumiere": ["institut-francais.org.uk", "cinelumiere.savoysystems.co.uk"],
  "arthouse-crouch-end": ["arthousecrouchend.co.uk", "arthousecrouchend.savoysystems.co.uk"],
  "electric-portobello": ["electriccinema.co.uk"],
  "lexi": ["thelexicinema.co.uk"],
  "riverside-studios": ["riversidestudios.co.uk"],
  "olympic-studios": ["olympiccinema.co.uk", "mycloudcinema.com"],
};

/**
 * Domains that block automated HEAD/GET requests (bot protection / session cookies).
 * URLs from these domains are considered "ok" even if they return 403,
 * since they work correctly in a real browser.
 */
const BOT_PROTECTED_DOMAINS = [
  "whatson.bfi.org.uk",    // Cloudflare bot protection
  "ticketing.eu.veezi.com", // Requires session cookies
  "genesiscinema.co.uk",    // Veezi-powered ticketing
];

export interface BookingCheckResult {
  url: string;
  status: number | null;
  ok: boolean;
  redirectUrl?: string;
  error?: string;
}

/**
 * Check a batch of booking URLs via fetch HEAD requests.
 * Uses fetch (not Playwright) for efficiency.
 */
export async function checkBookingLinks(
  urls: Array<{ url: string; filmTitle: string; cinemaName: string; cinemaSlug?: string }>,
  concurrency: number = 5
): Promise<{ results: BookingCheckResult[]; issues: AuditIssue[] }> {
  const results: BookingCheckResult[] = [];
  const issues: AuditIssue[] = [];

  // Process in batches to respect rate limits
  const queue = [...urls];
  const activePromises: Promise<void>[] = [];

  async function processOne(item: typeof urls[0]) {
    const result = await checkSingleBookingLink(item.url);
    results.push(result);

    if (!result.ok) {
      // Check if this is a bot-protected domain (403 expected)
      let isBotProtected = false;
      try {
        const hostname = new URL(item.url).hostname.toLowerCase();
        isBotProtected = result.status === 403 &&
          BOT_PROTECTED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
      } catch { /* invalid URL */ }

      if (!isBotProtected) {
        issues.push({
          severity: "critical",
          category: "broken_booking_link",
          message: `Booking link returns ${result.status || "error"}: "${item.filmTitle}" at ${item.cinemaName}`,
          entity: item.filmTitle,
          details: {
            url: item.url,
            status: result.status,
            cinema: item.cinemaName,
            error: result.error,
            redirectUrl: result.redirectUrl,
          },
          url: item.url,
        });
      }
    }

    // Check domain matches cinema
    if (item.cinemaSlug && CINEMA_DOMAIN_MAP[item.cinemaSlug]) {
      const expectedDomains = CINEMA_DOMAIN_MAP[item.cinemaSlug];
      try {
        const urlObj = new URL(item.url);
        const hostname = urlObj.hostname.toLowerCase();
        const domainMatches = expectedDomains.some(
          (d) => hostname === d || hostname.endsWith(`.${d}`)
        );
        if (!domainMatches) {
          issues.push({
            severity: "warning",
            category: "booking_domain_mismatch",
            message: `Booking URL domain mismatch for "${item.filmTitle}" at ${item.cinemaName}: got "${hostname}", expected one of [${expectedDomains.join(", ")}]`,
            entity: item.filmTitle,
            details: {
              url: item.url,
              cinema: item.cinemaName,
              cinemaSlug: item.cinemaSlug,
              hostname,
              expectedDomains,
            },
          });
        }
      } catch {
        // Invalid URL — already covered by broken link check
      }
    }
  }

  for (const item of queue) {
    const promise = processOne(item).then(() => {
      const idx = activePromises.indexOf(promise);
      if (idx >= 0) activePromises.splice(idx, 1);
    });
    activePromises.push(promise);

    if (activePromises.length >= concurrency) {
      await Promise.race(activePromises);
    }
  }

  // Wait for remaining
  await Promise.all(activePromises);

  return { results, issues };
}

/**
 * Check a single booking URL via HEAD request with fallback to GET.
 */
async function checkSingleBookingLink(url: string): Promise<BookingCheckResult> {
  try {
    // Use HEAD first (lighter)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    const ok = response.status >= 200 && response.status < 400;

    return {
      url,
      status: response.status,
      ok,
      redirectUrl: response.redirected ? response.url : undefined,
    };
  } catch (error) {
    // HEAD might be rejected — try GET
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });
      clearTimeout(timeout);

      const ok = response.status >= 200 && response.status < 400;
      // Consume body to free connection
      await response.text().catch(() => {});

      return {
        url,
        status: response.status,
        ok,
        redirectUrl: response.redirected ? response.url : undefined,
      };
    } catch (getError) {
      return {
        url,
        status: null,
        ok: false,
        error: getError instanceof Error ? getError.message : "Unknown error",
      };
    }
  }
}
