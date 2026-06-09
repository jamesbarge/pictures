import { describe, expect, it } from 'vitest';

import {
	addDaysToDateString,
	londonClock,
	londonDateString,
	londonDateTime,
	londonWeekendRange,
	nextLondonDateTime
} from './london-date';

describe('London date helpers', () => {
	it('uses the London calendar date around the BST midnight boundary', () => {
		expect(londonDateString(new Date('2026-06-09T22:59:00Z'))).toBe('2026-06-09');
		expect(londonDateString(new Date('2026-06-09T23:00:00Z'))).toBe('2026-06-10');
	});

	it('constructs London times with the offset for that specific date and time', () => {
		expect(londonDateTime('2026-01-09', 18).toISOString()).toBe(
			'2026-01-09T18:00:00.000Z'
		);
		expect(londonDateTime('2026-06-09', 18).toISOString()).toBe(
			'2026-06-09T17:00:00.000Z'
		);
		expect(londonDateTime('2026-03-29', 18).toISOString()).toBe(
			'2026-03-29T17:00:00.000Z'
		);
		expect(londonDateTime('2026-10-25', 18).toISOString()).toBe(
			'2026-10-25T18:00:00.000Z'
		);
		expect(londonDateTime('2026-10-25', 1).toISOString()).toBe(
			'2026-10-25T00:00:00.000Z'
		);
	});

	it('reads London clock time independently of the device timezone', () => {
		expect(londonClock(new Date('2026-06-09T17:30:00Z'))).toEqual({
			hour: 18,
			minute: 30
		});
	});

	it('adds calendar days without crossing timezone boundaries', () => {
		expect(addDaysToDateString('2026-03-28', 1)).toBe('2026-03-29');
		expect(addDaysToDateString('2026-10-25', 7)).toBe('2026-11-01');
	});

	it('keeps Sunday in the current Saturday-to-Sunday weekend', () => {
		const sunday = new Date('2026-06-14T11:00:00Z');
		expect(londonWeekendRange(sunday)).toEqual({
			from: '2026-06-13',
			to: '2026-06-14'
		});
		expect(londonWeekendRange(sunday, 1)).toEqual({
			from: '2026-06-27',
			to: '2026-06-28'
		});
	});

	it('builds the next preset time in London, including after it has passed', () => {
		const now = new Date('2026-06-09T19:30:00Z');
		expect(nextLondonDateTime(20, 0, now).toISOString()).toBe(
			'2026-06-10T19:00:00.000Z'
		);
		expect(nextLondonDateTime(22, 0, now).toISOString()).toBe(
			'2026-06-09T21:00:00.000Z'
		);
	});
});
