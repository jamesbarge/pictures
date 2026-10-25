/**
 * Plain-English names for every active filter. One source for the line in the
 * first day header, the burger's badge count and the sidebar's section hints,
 * so a filter can never be on without the page saying so.
 */
import { FORMAT_OPTIONS, GENRE_OPTIONS } from '$lib/constants/filters';
import { addDaysToDateString } from '$lib/london-date';

/** Time-of-day chips. Same hour ranges as TIME_PRESETS, friendlier labels. */
export const TIME_OF_DAY = [
	{ label: 'Before noon', range: '9–12', from: 0, to: 11 },
	{ label: 'Matinée', range: '12–5', from: 12, to: 16 },
	{ label: 'Early evening', range: '5–8', from: 17, to: 20 },
	{ label: 'Late', range: 'after 8', from: 21, to: 23 }
] as const;

export interface ChoiceFilters {
	filmSearch: string;
	cinemaIds: string[];
	dateFrom: string | null;
	dateTo: string | null;
	timeFrom: number | null;
	timeTo: number | null;
	formats: string[];
	programmingTypes: string[];
	genres: string[];
	decades: string[];
}

export interface NamedCinema {
	id: string;
	name: string;
	shortName: string | null;
}

const shortDate = new Intl.DateTimeFormat('en-GB', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	timeZone: 'Europe/London'
});
const fmtDate = (iso: string) => shortDate.format(new Date(iso + 'T12:00:00Z'));

/** "Today", "Tomorrow", "This week", or the picked date(s); null when no date filter. */
export function dayLabel(from: string | null, to: string | null, today: string): string | null {
	if (!from) return null;
	const tomorrow = addDaysToDateString(today, 1);
	if (from === today && to === today) return 'Today';
	if (from === tomorrow && to === tomorrow) return 'Tomorrow';
	if (from === today && to === addDaysToDateString(today, 7)) return 'This week';
	return !to || to === from ? fmtDate(from) : `${fmtDate(from)} to ${fmtDate(to)}`;
}

export function activeChoices(f: ChoiceFilters, cinemas: NamedCinema[], today: string): string[] {
	const out: string[] = [];

	if (f.programmingTypes.includes('new_release')) out.push('New');
	else if (f.programmingTypes.includes('repertory')) out.push('Rep');

	const day = dayLabel(f.dateFrom, f.dateTo, today);
	if (day) out.push(day);

	if (f.timeFrom !== null) {
		const preset = TIME_OF_DAY.find((t) => t.from === f.timeFrom && t.to === f.timeTo);
		out.push(preset ? preset.label : `From ${f.timeFrom}:00`);
	}

	if (f.cinemaIds.length === 1) {
		const c = cinemas.find((x) => x.id === f.cinemaIds[0]);
		out.push(c ? (c.shortName ?? c.name) : '1 cinema');
	} else if (f.cinemaIds.length > 1) {
		out.push(`${f.cinemaIds.length} cinemas`);
	}

	for (const g of f.genres) out.push(GENRE_OPTIONS.find((o) => o.value === g)?.label ?? g);
	for (const v of f.formats) out.push(FORMAT_OPTIONS.find((o) => o.value === v)?.label ?? v);
	for (const d of f.decades) out.push(d);

	const q = f.filmSearch.trim();
	if (q) out.push(`“${q}”`);

	return out;
}
