import { describe, expect, it } from 'vitest';
import { activeChoices, dayLabel, type ChoiceFilters } from './active-choices';

const TODAY = '2026-10-15';
const none: ChoiceFilters = {
	filmSearch: '',
	cinemaIds: [],
	dateFrom: null,
	dateTo: null,
	timeFrom: null,
	timeTo: null,
	formats: [],
	programmingTypes: [],
	genres: [],
	decades: []
};
const cinemas = [
	{ id: 'rio', name: 'Rio Cinema', shortName: 'Rio' },
	{ id: 'ica', name: 'Institute of Contemporary Arts', shortName: null }
];

describe('activeChoices', () => {
	it('is empty with no filters', () => {
		expect(activeChoices(none, cinemas, TODAY)).toEqual([]);
	});

	it('names every active filter in sidebar order', () => {
		const f: ChoiceFilters = {
			...none,
			programmingTypes: ['repertory'],
			dateFrom: '2026-10-16',
			dateTo: '2026-10-16',
			timeFrom: 17,
			timeTo: 20,
			cinemaIds: ['rio'],
			genres: ['horror'],
			formats: ['35mm'],
			decades: ['70s'],
			filmSearch: ' cronenberg '
		};
		expect(activeChoices(f, cinemas, TODAY)).toEqual([
			'Rep', 'Tomorrow', 'Early evening', 'Rio', 'Horror', '35MM', '70s', '“cronenberg”'
		]);
	});

	it('counts several cinemas and falls back to the full name', () => {
		expect(activeChoices({ ...none, cinemaIds: ['rio', 'ica'] }, cinemas, TODAY)).toEqual(['2 cinemas']);
		expect(activeChoices({ ...none, cinemaIds: ['ica'] }, cinemas, TODAY)).toEqual([
			'Institute of Contemporary Arts'
		]);
	});
});

describe('dayLabel', () => {
	it('names the presets and formats picked dates', () => {
		expect(dayLabel(null, null, TODAY)).toBeNull();
		expect(dayLabel(TODAY, TODAY, TODAY)).toBe('Today');
		expect(dayLabel('2026-10-22', '2026-10-22', TODAY)).toBe('Thu 22 Oct');
		expect(dayLabel(TODAY, '2026-10-22', TODAY)).toBe('This week');
		expect(dayLabel('2026-10-17', '2026-10-18', TODAY)).toBe('Sat 17 Oct to Sun 18 Oct');
	});
});
