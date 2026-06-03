/**
 * Minimal iCal (RFC 5545) VEVENT parser — only what cinema scrapers need.
 *
 * Handles:
 *   - Line folding: continuation lines starting with space/tab are unwrapped
 *   - TEXT escape sequences: `\,`, `\;`, `\\`, `\n` in SUMMARY etc.
 *   - DTSTART;TZID=Europe/London:YYYYMMDDTHHmmss — UK-local form (the only
 *     timezone form we see in practice from WordPress Events Calendar feeds)
 *
 * NOT handled (out of scope — add only when a real venue needs them):
 *   - UTC `DTSTART:YYYYMMDDTHHmmssZ` (would need `Z` branch + UTC parse)
 *   - Floating times (no TZID, no Z)
 *   - RRULE / recurrence expansion
 *   - VALARM / VTIMEZONE / arbitrary X- properties (silently skipped)
 *
 * First used by the Cinema Museum scraper (2026-05-15). Extracted to utils on
 * 2026-05-17 in preparation for any future iCal-based London venue (other
 * Events-Calendar-WordPress sites, Bertha DocHouse's hypothetical iCal feed,
 * etc.). The Cinema Museum scraper imports `parseVEvents` from here.
 */

export interface ParsedVEvent {
  /** RFC 5545 UID — globally unique event ID. */
  uid: string;
  /** Event title (escapes unwrapped). */
  summary: string;
  /**
   * Local-time DTSTART components for the UK timezone. Callers pair with
   * `ukLocalToUTC` from `../utils/date-parser.ts` to get a Date.
   */
  dtStartUKLocal: {
    year: number;
    /** 0-indexed (January = 0) to match Date constructor convention. */
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
  /** Event detail URL if present. */
  url?: string;
  /** Comma-split CATEGORIES (trimmed, empty values dropped). */
  categories: string[];
}

/** Public for unit testing. */
export function parseVEvents(icalText: string): ParsedVEvent[] {
  // Unfold line continuations (a leading space/tab continues the previous line)
  const lines = icalText.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);

  const events: ParsedVEvent[] = [];
  let current: Partial<ParsedVEvent> & { _open?: boolean } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { _open: true, categories: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && current.uid && current.summary && current.dtStartUKLocal) {
        events.push({
          uid: current.uid,
          summary: current.summary,
          dtStartUKLocal: current.dtStartUKLocal,
          url: current.url,
          categories: current.categories ?? [],
        });
      }
      current = null;
      continue;
    }
    if (!current?._open) continue;

    // Split into "PROPERTY[;params]" and "value"
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const propWithParams = line.slice(0, colon);
    const rawValue = line.slice(colon + 1);
    const semi = propWithParams.indexOf(";");
    const prop = semi < 0 ? propWithParams : propWithParams.slice(0, semi);

    switch (prop) {
      case "UID":
        current.uid = rawValue;
        break;
      case "SUMMARY":
        current.summary = unescapeIcalText(rawValue);
        break;
      case "URL":
        current.url = rawValue;
        break;
      case "CATEGORIES":
        current.categories = rawValue.split(",").map((c) => c.trim()).filter(Boolean);
        break;
      case "DTSTART": {
        // Format: 20260516T193000 (no tz, paired with TZID=Europe/London in params).
        // We deliberately ignore the TZID param value: every iCal feed we
        // consume emits TZID=Europe/London, and the project's
        // `ukLocalToUTC()` helper handles the UK-local → UTC conversion
        // including BST. If a feed ever emits a different TZID, the resulting
        // Date will be wrong — add explicit branching here at that point.
        const m = rawValue.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}/);
        if (!m) break;
        const [, year, month, day, hour, minute] = m;
        current.dtStartUKLocal = {
          year: parseInt(year, 10),
          month: parseInt(month, 10) - 1, // 0-indexed
          day: parseInt(day, 10),
          hour: parseInt(hour, 10),
          minute: parseInt(minute, 10),
        };
        break;
      }
    }
  }

  return events;
}

function unescapeIcalText(s: string): string {
  return s
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}
