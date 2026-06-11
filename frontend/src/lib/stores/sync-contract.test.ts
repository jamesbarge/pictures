import { describe, expect, it } from 'vitest';

import { getServerFilmStatuses } from './sync-contract';

describe('getServerFilmStatuses', () => {
	it('converts the API status map into the array consumed by pull sync', () => {
		expect(
			getServerFilmStatuses({
				statuses: {
					'film-1': { filmId: 'film-1', status: 'seen' },
					'film-2': { filmId: 'film-2', status: 'want_to_see' }
				}
			})
		).toEqual([
			{ filmId: 'film-1', status: 'seen' },
			{ filmId: 'film-2', status: 'want_to_see' }
		]);
	});
});
