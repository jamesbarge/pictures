/**
 * Rich Mix Cinema Scraper (v3 - Spektrix public API)
 *
 * Cinema: Rich Mix (Shoreditch)
 * Address: 35-47 Bethnal Green Rd, London E1 6LA
 * Website: https://richmix.org.uk
 * 3 screens: Screen 1 (181 seats), Screen 2 (132 seats), Screen 3 (59 seats)
 *
 * 2026-07-13 rewrite: the old WordPress JSON endpoint
 * (/whats-on/cinema/?ajax=1&json=1) was removed in a site restructure —
 * /whats-on/cinema/ now 301s to /cinema/ and returns HTML. We now read the
 * venue's public Spektrix v3 API directly:
 *   https://system.spektrix.com/richmix/api/v3/events      (film metadata)
 *   https://system.spektrix.com/richmix/api/v3/instances?startFrom=YYYY-MM-DD
 * Film events are identified by attribute_COGEventProgramme === "FILM".
 * Instance `startUtc` is authoritative (timeSource: "iso").
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";

interface SpektrixEvent {
  id: string;
  name: string;
  duration?: number;
  isOnSale: boolean;
  imageUrl?: string;
  attribute_COGEventProgramme?: string;
  attribute_VENUE?: string;
}

interface SpektrixInstance {
  id: string;
  startUtc: string; // ISO UTC, e.g. "2026-07-14T09:00:00" (Z implied)
  cancelled?: boolean;
  isOnSale?: boolean;
  event: { id: string };
  attribute_MembersOnlyScreening?: boolean;
}

const SPEKTRIX_BASE = "https://system.spektrix.com/richmix/api/v3";

export class RichMixScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "rich-mix",
    baseUrl: "https://richmix.org.uk",
    requestsPerMinute: 30,
    delayBetweenRequests: 500,
  };

  protected async fetchPages(): Promise<string[]> {
    console.log("[rich-mix] Fetching Spektrix events + instances...");
    const events = await this.fetchUrl(`${SPEKTRIX_BASE}/events`);
    await this.delay(this.config.delayBetweenRequests);
    const startFrom = new Date().toISOString().slice(0, 10);
    const instances = await this.fetchUrl(
      `${SPEKTRIX_BASE}/instances?startFrom=${startFrom}`,
    );
    return [events, instances];
  }

  protected async parsePages(jsonPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const events: SpektrixEvent[] = JSON.parse(jsonPages[0]);
    const instances: SpektrixInstance[] = JSON.parse(jsonPages[1]);

    const filmEvents = new Map<string, SpektrixEvent>();
    for (const e of events) {
      if (e.attribute_COGEventProgramme === "FILM") filmEvents.set(e.id, e);
    }
    console.log(
      `[rich-mix] ${events.length} events (${filmEvents.size} film), ${instances.length} future instances`,
    );

    const now = new Date();
    const screenings: RawScreening[] = [];
    const seenIds = new Set<string>();

    for (const inst of instances) {
      if (inst.cancelled) continue;
      const event = filmEvents.get(inst.event?.id);
      if (!event) continue; // music/theatre/comedy instance

      // Spektrix omits the Z on startUtc — append if missing
      const iso = inst.startUtc.endsWith("Z") ? inst.startUtc : `${inst.startUtc}Z`;
      const datetime = new Date(iso);
      if (isNaN(datetime.getTime()) || datetime < now) continue;

      const sourceId = `richmix-${inst.id}`;
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);

      const title = this.cleanEventName(event.name);
      const bookingUrl = this.buildBookingUrl(inst.id);

      screenings.push({
        filmTitle: title,
        datetime,
        bookingUrl,
        sourceId,
        runtime: event.duration && event.duration > 0 ? event.duration : undefined,
        screen: event.attribute_VENUE || undefined,
        timeSource: "iso",
        ...FestivalDetector.detect("rich-mix", title, datetime, bookingUrl),
      });
    }

    console.log(`[rich-mix] ${screenings.length} film screenings`);
    return screenings;
  }

  /** "The Odyssey (12A)" → "The Odyssey" — strip trailing BBFC rating. */
  private cleanEventName(name: string): string {
    return name
      .trim()
      .replace(/\s*\((U|PG|12A?|15|18|R18|TBC|CTBA)\*?\)\s*$/i, "")
      .trim();
  }

  /**
   * Rich Mix's public per-screening booking deep link:
   *   https://richmix.org.uk/book/instance/{numericId}
   *
   * `{numericId}` is the leading numeric run of the Spektrix instance id
   * (e.g. instance "1904605ACPRGT…" → /book/instance/1904605), verified against
   * the live /cinema/ listing whose showtime links use exactly this form.
   *
   * We previously guessed the WordPress film-page slug by slugifying the event
   * name (/cinema/{slug}/). That was fundamentally unreliable: Rich Mix sets
   * those WP slugs independently of the Spektrix event name, and the two even
   * disagree on the BBFC rating baked into the slug (Spektrix "The Odyssey (15)"
   * vs WP the-odyssey-12a; "Spider-Man: Brand New Day (12A)" vs WP
   * spider-man-brand-new-day-u), while Spektrix also carries pre-launch staging
   * events ("TEST The Invite") that have no WP page at all. The guess therefore
   * 404'd for a large fraction of the venue. The per-instance deep link is
   * stable, keyed on data we already hold, and always resolves (HTTP 200).
   */
  private buildBookingUrl(instanceId: string): string {
    const numericId = instanceId.match(/^\d+/)?.[0];
    // Defensive: a malformed id must never regress to a guessed 404 — the
    // /cinema/ listing always resolves. In practice every Spektrix instance id
    // starts with its numeric web id, so this fallback should not fire.
    return numericId
      ? `${this.config.baseUrl}/book/instance/${numericId}`
      : `${this.config.baseUrl}/cinema/`;
  }

  /**
   * The Spektrix API is the real dependency — health-check it, not the WP site.
   *
   * Retries with a short backoff (mirrors BaseScraper.healthCheck, which this
   * override had dropped). The previous single-shot probe was the root cause of
   * Rich Mix's "critical flaky" status: nearly every scheduled ~03:xx-UTC run
   * failed at "site not accessible" when one probe to system.spektrix.com
   * blipped (it occasionally returns an HTML error page instead of JSON), even
   * though the venue recovers within seconds and every manual daytime run
   * succeeded. A brief retry rescues those transient windows without masking a
   * genuine outage — the same fix class as BaseScraper's Close-Up retry.
   */
  async healthCheck(): Promise<boolean> {
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = 4_000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const body = await this.fetchUrl(`${SPEKTRIX_BASE}/events`);
        if (Array.isArray(JSON.parse(body))) return true;
      } catch {
        // Network error / non-2xx / non-JSON error page — fall through to retry
      }
      if (attempt < MAX_ATTEMPTS) await this.delay(BACKOFF_MS);
    }
    return false;
  }
}

/** Creates a Rich Mix Cinema scraper (Spektrix API, extends BaseScraper). */
export function createRichMixScraperV2(): RichMixScraperV2 {
  return new RichMixScraperV2();
}
