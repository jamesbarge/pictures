import { describe, it, expect } from 'vitest';
import { formatLabel, toCardScreening } from './card-shapes';

describe('formatLabel', () => {
	it('renders nothing for the no-signal default formats', () => {
		expect(formatLabel('unknown')).toBe('');
		expect(formatLabel('dcp')).toBe('');
		expect(formatLabel(null)).toBe('');
		expect(formatLabel(undefined)).toBe('');
		expect(formatLabel('')).toBe('');
	});

	it('uppercases and replaces underscores for real formats', () => {
		expect(formatLabel('35mm')).toBe('35MM');
		expect(formatLabel('70mm')).toBe('70MM');
		expect(formatLabel('imax_70mm')).toBe('IMAX 70MM');
		expect(formatLabel('digital')).toBe('DIGITAL');
	});
});

describe('toCardScreening', () => {
	it('adapts a raw API screening', () => {
		expect(
			toCardScreening({
				id: 's1',
				datetime: '2026-06-06T18:00:00Z',
				format: '35mm',
				bookingUrl: 'https://example.com/book',
				cinema: { id: 'pcc', name: 'Prince Charles Cinema', shortName: 'PCC' }
			})
		).toEqual({
			id: 's1',
			datetime: '2026-06-06T18:00:00Z',
			cinemaName: 'Prince Charles Cinema',
			cinemaSlug: 'pcc',
			format: '35mm',
			bookingUrl: 'https://example.com/book'
		});
	});

	it('falls back gracefully when cinema is null', () => {
		const out = toCardScreening({ id: 's2', datetime: '2026-06-06T18:00:00Z', cinema: null });
		expect(out.cinemaName).toBe('Unknown');
		expect(out.cinemaSlug).toBe('');
		expect(out.format).toBeNull();
	});
});
