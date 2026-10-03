import { describe, it, expect } from 'vitest';
import { selectStartingSoon, type CalendarScreening, type FilmGroup } from './calendar-filter';

const NOW = Date.parse('2026-10-03T17:00:00Z'); // 18:00 London (BST)
const MIN = 60_000;

function film(id: string) {
	return { id, title: `Film ${id}`, year: 2000, director: null, genres: [], isRepertory: false };
}

function screening(id: string, filmId: string, minutesFromNow: number): CalendarScreening {
	return {
		id,
		datetime: new Date(NOW + minutesFromNow * MIN).toISOString(),
		format: null,
		film: film(filmId),
		cinema: { id: 'c', name: 'Cinema' }
	};
}

function mapOf(...screenings: CalendarScreening[]): Map<string, FilmGroup> {
	const map = new Map<string, FilmGroup>();
	for (const s of screenings) {
		const group = map.get(s.film!.id);
		if (group) group.screenings.push(s);
		else map.set(s.film!.id, { film: s.film!, screenings: [s] });
	}
	return map;
}

const OPTS = { windowMs: 180 * MIN, limit: 6 };

function ids(groups: FilmGroup[]): string[] {
	return groups.flatMap((g) => g.screenings.map((s) => s.id));
}

describe('selectStartingSoon', () => {
	it('returns screenings inside the window, soonest first, across films', () => {
		const result = selectStartingSoon(
			mapOf(screening('a2', 'a', 90), screening('b1', 'b', 20), screening('a1', 'a', 45)),
			NOW,
			OPTS
		);
		expect(result.map((g) => g.film.id)).toEqual(['b', 'a']);
		expect(ids(result)).toEqual(['b1', 'a1', 'a2']);
	});

	it('excludes screenings that have started or sit beyond the window', () => {
		const result = selectStartingSoon(
			mapOf(
				screening('started', 'a', -5),
				screening('exactly-now', 'a', 0),
				screening('edge', 'b', 180),
				screening('too-late', 'c', 181)
			),
			NOW,
			OPTS
		);
		expect(ids(result)).toEqual(['edge']);
	});

	it('caps the result at `limit` screenings after sorting by time', () => {
		const screenings = [50, 10, 40, 20, 60, 30, 70, 5].map((m, i) => screening(`s${m}`, `f${i}`, m));
		const result = selectStartingSoon(mapOf(...screenings), NOW, OPTS);
		expect(ids(result)).toEqual(['s5', 's10', 's20', 's30', 's40', 's50']);
	});

	it('breaks start-time ties by screening id so server and client agree', () => {
		const result = selectStartingSoon(
			mapOf(screening('z', 'a', 30), screening('m', 'b', 30)),
			NOW,
			{ windowMs: 180 * MIN, limit: 1 }
		);
		expect(ids(result)).toEqual(['m']);
	});

	it('compares tied ids by code unit, so a Danish locale cannot reorder them', () => {
		// Danish collation reads "aa" as "å" and sorts it after "z", so
		// localeCompare would put c3b1… first on a da-DK client.
		const result = selectStartingSoon(
			mapOf(screening('c3b10000', 'a', 30), screening('c3aa91f2', 'b', 30)),
			NOW,
			OPTS
		);
		expect(ids(result)).toEqual(['c3aa91f2', 'c3b10000']);
	});

	it('returns an empty list when nothing starts in the window', () => {
		expect(selectStartingSoon(mapOf(screening('late', 'a', 400)), NOW, OPTS)).toEqual([]);
		expect(selectStartingSoon(new Map(), NOW, OPTS)).toEqual([]);
	});
});
