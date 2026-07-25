import { test, expect, type Page } from '@playwright/test';

/**
 * Regression: a film card must never render another film's poster.
 *
 * `/` and `/this-weekend` are served with `s-maxage=3600,
 * stale-while-revalidate=86400`, so a visitor can be handed HTML up to a day
 * older than their own clock. Both pages re-filter expired screenings at render
 * time — and when that filter runs during the *first* client render it drops
 * films the cached HTML included, shifting the keyed `{#each}`.
 *
 * Svelte deliberately skips writing `src`/`srcset` while hydrating
 * (svelte/src/internal/client/dom/elements/attributes.js — "we assume they are
 * the same between client and server"), so a shifted card keeps the *previous*
 * film's poster. Nothing re-renders afterwards, so it stays wrong for the whole
 * session. Measured in production at 31 of 40 homepage cards.
 *
 * To reproduce deterministically we let the server render with the real clock,
 * then advance the page's clock past the end of the first rendered day. That
 * expires a whole day group no matter when the suite runs, while leaving the
 * later days on the page to assert against.
 */

/** Push only the page's wall clock forward; leave timers alone. */
async function skewPageClock(page: Page, skewMs: number) {
	await page.addInitScript((skew) => {
		const RealDate = Date;
		const Shifted = class extends RealDate {
			constructor(...args: unknown[]) {
				if (args.length === 0) {
					super(RealDate.now() + skew);
				} else {
					// @ts-expect-error — forwarding the real constructor overloads
					super(...args);
				}
			}
			static now() {
				return RealDate.now() + skew;
			}
		};
		// @ts-expect-error — deliberately replacing the global for this page
		Date = Shifted;
	}, skewMs);
}

/** Poster file name, so w342/w500 srcset variants compare equal. */
function posterFile(url: string | null | undefined): string | null {
	if (!url) return null;
	const m = String(url).match(/\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|svg|webp))(?:\?|$)/);
	return m ? m[1] : String(url);
}

const londonDate = (d: Date) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

/** (film id, title, painted poster) for every card on the page. */
async function renderedCards(page: Page) {
	return page.evaluate(() => {
		const out: Array<{ id: string; title: string; src: string | null }> = [];
		for (const article of Array.from(document.querySelectorAll('article'))) {
			const link = article.querySelector('a[href^="/film/"]');
			const img = article.querySelector('img');
			if (!link || !img) continue;
			const heading = article.querySelector('h1, h2, h3, h4');
			out.push({
				id: (link.getAttribute('href') ?? '').replace('/film/', ''),
				title: heading?.textContent?.trim() ?? '',
				src: img.currentSrc || img.getAttribute('src')
			});
		}
		return out;
	});
}

/** Every screening datetime rendered on the page. */
async function screeningTimes(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll('time[datetime]'))
			.map((n) => n.getAttribute('datetime') ?? '')
			.filter(Boolean)
	);
}

for (const route of ['/', '/this-weekend']) {
	test(`posters stay with their own film across hydration: ${route}`, async ({ page }, testInfo) => {
		// The bug is viewport-independent (it is a reconciliation fault, not a
		// layout one) and each run is expensive, so cover it once.
		test.skip(testInfo.project.name !== 'chromium', 'covered once, on chromium');
		// Dev renders through the production API, so page loads are slow.
		test.setTimeout(150_000);

		// Pass 1 — real clock. Establishes the server's own film -> poster pairing
		// and tells us how far to advance to expire the first day.
		await page.goto(route);
		await page.waitForTimeout(3000);

		const baseline = await renderedCards(page);
		if (route === '/') {
			// `/` always has cards. Failing (rather than skipping) here is what stops
			// a markup change to `renderedCards`' selectors silently disabling the
			// only regression cover for this bug.
			expect(baseline.length, 'homepage must render cards').toBeGreaterThan(0);
		} else {
			// `/this-weekend` is legitimately empty outside its window.
			test.skip(baseline.length === 0, `${route} has no cards right now`);
		}

		const truth = new Map(baseline.map((c) => [c.id, posterFile(c.src)]));

		const times = (await screeningTimes(page)).map((t) => new Date(t)).sort((a, b) => +a - +b);
		expect(times.length, `${route} should render screening times`).toBeGreaterThan(0);
		const firstDay = londonDate(times[0]);
		const lastOfFirstDay = times.filter((t) => londonDate(t) === firstDay).at(-1)!;
		const skewMs = +lastOfFirstDay + 60_000 - Date.now();
		test.skip(skewMs <= 0, 'first rendered day has already ended; nothing to expire');

		// Pass 2 — the server still renders with the real clock, the page believes
		// the first day is over.
		const stale = await page.context().newPage();
		let after: Awaited<ReturnType<typeof renderedCards>>;
		try {
			await skewPageClock(stale, skewMs);
			await stale.goto(route);
			await stale.waitForTimeout(3500);
			after = await renderedCards(stale);
		} finally {
			await stale.close();
		}

		expect(after.length, `${route} should still render cards after the skew`).toBeGreaterThan(0);
		expect(
			after.length,
			'precondition: the skew must actually drop cards, otherwise nothing shifts'
		).toBeLessThan(baseline.length);

		// A card that lost its poster entirely is also a failure, so compare the
		// null case rather than filtering it out.
		const mismatches = after
			.filter((c) => truth.has(c.id) && truth.get(c.id) !== null)
			.map((c) => ({ ...c, expected: truth.get(c.id)!, actual: posterFile(c.src) }))
			.filter((c) => c.expected !== c.actual);

		expect(
			mismatches,
			`cards rendering another film's poster on ${route}:\n` +
				mismatches
					.map((m) => `  "${m.title}" (${m.id})\n     expected ${m.expected}\n     rendered ${m.actual}`)
					.join('\n')
		).toEqual([]);
	});
}
