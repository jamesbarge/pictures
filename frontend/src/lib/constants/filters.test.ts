import { describe, expect, it } from 'vitest';
import {
	DECADE_OPTIONS,
	FORMAT_OPTIONS,
	GENRE_OPTIONS,
	normalizeFormatFilterValue,
	normalizeGenreFilterValue
} from './filters';

describe('filter options', () => {
	it('uses canonical screening format values for every format chip', () => {
		const canonicalFormats = new Set([
			'35mm',
			'70mm',
			'70mm_imax',
			'dcp',
			'dcp_4k',
			'imax',
			'imax_laser',
			'dolby_cinema',
			'4dx',
			'screenx',
			'unknown'
		]);
		const values = FORMAT_OPTIONS.map((option) => option.value);

		expect(values.every((value) => canonicalFormats.has(value))).toBe(true);
		expect(values).toContain('dcp_4k');
		expect(values).not.toContain('4k');
		expect(new Set(values).size).toBe(values.length);
	});

	it('keeps display labels separate from canonical genre values', () => {
		expect(GENRE_OPTIONS).toContainEqual({ value: 'science fiction', label: 'Sci-fi' });
		expect(GENRE_OPTIONS).toContainEqual({ value: 'animation', label: 'Animation' });
		expect(new Set(GENRE_OPTIONS.map((option) => option.value)).size).toBe(GENRE_OPTIONS.length);
	});

	it('matches the decade values understood by the homepage filter chain', () => {
		expect(DECADE_OPTIONS).toEqual([
			'2020s',
			'2010s',
			'2000s',
			'90s',
			'80s',
			'70s',
			'Pre-1970'
		]);
	});

	it('normalizes legacy persisted values to their canonical replacements', () => {
		expect(normalizeFormatFilterValue('4k')).toBe('dcp_4k');
		expect(normalizeFormatFilterValue('35mm')).toBe('35mm');
		expect(normalizeGenreFilterValue('sci-fi')).toBe('science fiction');
		expect(normalizeGenreFilterValue('drama')).toBe('drama');
	});
});
