import { test, expect, type Page } from '@playwright/test';

import { BASE } from './base-url';

// Runtime cover for the identity half of the 2026-07-27 analytics fix: a
// returning visitor must keep their distinct_id across page loads. This is the
// fault that made retention unmeasurable — initialising posthog-js under
// `persistence: 'memory'` left `get_distinct_id()` empty on every load, so a new
// "person" was minted each visit (348 people with 1 session, 2 with more, while
// device fingerprints proved the same phones returning across six days).
//
// Deliberately asserts only on posthog's PERSISTED STATE, never on captured
// events. Event capture is not observable here: `/ingest/*` is not proxied by the
// preview server, and stubbing it well enough for posthog-js to drain its queue
// proved unreliable — not even the automatic `$opt_in` event appeared. The init
// CONFIG is covered instead by src/lib/analytics/posthog-config.test.ts, which
// runs in CI and fails against the old values.
//
// SKIPS when PostHog is key-disabled (CI sets PUBLIC_POSTHOG_KEY=''), because
// initPostHog() returns early and there is no state to inspect.

/** posthog-js stores its state under `ph_<token>_posthog`. */
async function readPostHogState(page: Page): Promise<{ distinct_id?: string } | null> {
	return page.evaluate(() => {
		const key = Object.keys(localStorage).find((k) => /^ph_.+_posthog$/.test(k));
		if (!key) return null;
		try {
			return JSON.parse(localStorage.getItem(key)!);
		} catch {
			return null;
		}
	});
}

/** PostHog is idle-deferred (up to 2s); detect it by its own boot traffic. */
async function waitForPostHogBoot(hits: string[]): Promise<boolean> {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		if (hits.length > 0) return true;
		await new Promise((r) => setTimeout(r, 200));
	}
	return false;
}

test.describe('analytics identity', () => {
	test.setTimeout(120_000);

	test('a returning visitor keeps the same distinct_id, and nothing persists pre-consent', async ({
		page
	}) => {
		const hits: string[] = [];
		page.on('request', (req) => {
			if (req.url().includes('/ingest/')) hits.push(req.url());
		});

		await page.goto(BASE);
		const booted = await waitForPostHogBoot(hits);
		test.skip(!booted, 'PostHog is not configured in this environment (no PUBLIC_POSTHOG_KEY)');

		// Pre-consent the store is `memory`, so nothing may be written to disk.
		const accept = page.getByRole('button', { name: 'ACCEPT ALL' });
		await expect(accept).toBeVisible();
		expect(
			await readPostHogState(page),
			'nothing may be persisted before a consent decision'
		).toBeNull();

		await accept.click();

		// Accepting promotes the memory-held id into localStorage+cookie.
		await expect
			.poll(() => readPostHogState(page).then((s) => s?.distinct_id ?? null), {
				message: 'consent must promote posthog state into localStorage',
				timeout: 20000
			})
			.toBeTruthy();

		const firstId = (await readPostHogState(page))!.distinct_id!;

		// The regression itself: on reload, posthog must ADOPT the stored id rather
		// than mint a new one. Under the old `persistence: 'memory'` init this
		// assertion fails — the id differs on every load.
		hits.length = 0;
		await page.reload();
		expect(await waitForPostHogBoot(hits)).toBe(true);
		await expect
			.poll(() => readPostHogState(page).then((s) => s?.distinct_id ?? null), {
				message: 'a returning visitor must keep their distinct_id',
				timeout: 20000
			})
			.toBe(firstId);

		// And once more, to rule out a single lucky reload.
		hits.length = 0;
		await page.reload();
		expect(await waitForPostHogBoot(hits)).toBe(true);
		await expect
			.poll(() => readPostHogState(page).then((s) => s?.distinct_id ?? null), { timeout: 20000 })
			.toBe(firstId);
	});
});
