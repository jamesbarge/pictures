import { describe, expect, it } from 'vitest';

import { formatLeaveBy } from './travel-time';

describe('formatLeaveBy', () => {
	it('formats departure times in London', () => {
		expect(formatLeaveBy(new Date('2026-06-09T17:12:00Z'), 60)).toBe(
			'Leave by 6:12 pm'
		);
	});
});
