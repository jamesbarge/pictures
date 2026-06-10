export interface IcalScreeningData {
  id: string;
  datetime: Date;
  format: string | null;
  screen: string | null;
  eventType: string | null;
  bookingUrl: string;
  filmTitle: string;
  filmYear: number | null;
  filmRuntime: number | null;
  cinemaName: string;
  cinemaAddress: {
    street?: string;
    area?: string;
    postcode?: string;
  } | null;
}

export function escapeIcalText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatIcalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function buildIcsEvent(screening: IcalScreeningData): string {
  const start = formatIcalDate(new Date(screening.datetime));
  const duration = screening.filmRuntime || 120;
  const end = formatIcalDate(
    new Date(new Date(screening.datetime).getTime() + duration * 60 * 1000),
  );

  const title = `${screening.filmTitle}${screening.filmYear ? ` (${screening.filmYear})` : ""}`;
  const bookingUrl = safeHttpUrl(screening.bookingUrl);

  const descParts = [title, `at ${screening.cinemaName}`];
  if (screening.format && screening.format !== "unknown") {
    descParts.push(`Format: ${screening.format.toUpperCase()}`);
  }
  if (screening.eventType) {
    descParts.push(`Event: ${screening.eventType.replace(/_/g, " ")}`);
  }
  if (bookingUrl) {
    descParts.push(`Book: ${bookingUrl}`);
  }
  descParts.push("via Pictures (pictures.london)");

  const location = screening.cinemaAddress
    ? `${screening.cinemaName}, ${screening.cinemaAddress.street || ""}, ${screening.cinemaAddress.area || ""}, ${screening.cinemaAddress.postcode || ""}`
    : screening.cinemaName;

  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcalText(screening.id)}@pictures.london`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcalText(title)} at ${escapeIcalText(screening.cinemaName)}`,
    `DESCRIPTION:${escapeIcalText(descParts.join("\n"))}`,
    `LOCATION:${escapeIcalText(location)}`,
    ...(bookingUrl ? [`URL:${bookingUrl}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ].join("\r\n");
}

export function buildIcsCalendar(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pictures London//Cinema Listings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pictures London Cinema",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
