import { test, expect, devices } from '@playwright/test';

import { BASE, dismissConsent } from './base-url';

async function gotoHomeHydrated(page: import('@playwright/test').Page) {
	await page.goto(BASE);
	await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 10000 });
}

const burger = (page: import('@playwright/test').Page) =>
	page.getByRole('button', { name: /^Open menu/ });

// The burger wires its onclick only after Svelte hydrates, so a pre-hydration
// press is silently dropped. Re-press until the drawer actually appears; never
// once it has, since the open drawer covers the burger. `keyboard` opens it as
// a keyboard user would: WebKit does not focus a tapped button, so only a
// keyboard open gives the drawer a trigger to hand focus back to.
async function openDrawer(page: import('@playwright/test').Page, { keyboard = false } = {}) {
	const drawer = page.getByRole('dialog', { name: 'Menu and filters' });
	await expect(async () => {
		if (!(await drawer.isVisible())) {
			if (keyboard) {
				await burger(page).focus();
				await page.keyboard.press('Enter');
			} else {
				await burger(page).click();
			}
		}
		await expect(drawer).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 15000 });
	return drawer;
}

// Load `path`, let late layout settle, and assert the page never scrolls sideways.
async function expectNoOverflow(page: import('@playwright/test').Page, path: string) {
	await page.goto(`${BASE}${path}`);
	await page.waitForTimeout(1000);
	const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
	expect(overflow).toBe(false);
}

// Test at iPhone 12 Pro dimensions
test.use(devices['iPhone 12 Pro']);

test.beforeEach(({ context }) => dismissConsent(context));

test.describe('Mobile Responsive — iPhone 12 Pro (390x844)', () => {

	// ═══════════════════════════════════════════════
	// TOP BAR
	// ═══════════════════════════════════════════════

	test.describe('Top bar', () => {
		test('small logo fits within its home link without overflowing the viewport', async ({ page }) => {
			await page.goto(BASE);
			// Below 1024px the sidebar is a closed drawer, so the only visible home
			// link is the small logo beside ALL / NEW / REP in the top bar.
			const home = page.getByRole('link', { name: 'pictures london, what’s on' });
			await expect(home).toBeVisible();
			await expect(home.locator('img')).toBeVisible();

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

			// Logo must not spill past its containing home link (no clipping/overflow).
			const rightOverflow = await home.evaluate((link) => {
				const img = link.querySelector('img');
				return img ? img.getBoundingClientRect().right - link.getBoundingClientRect().right : null;
			});
			expect(
				rightOverflow,
				`logo extends ${rightOverflow}px past the right edge of its link (clipped)`
			).toBeLessThanOrEqual(1);
		});

		test('sign-in is gone: the drawer has no SIGN IN entry and /sign-in redirects home', async ({ page }) => {
			// /sign-in 307-redirects to the homepage site-wide.
			const resp = await page.goto(`${BASE}/sign-in`, { waitUntil: 'commit' });
			await page.waitForURL(`${BASE}/`);
			expect(resp?.status()).toBeLessThan(400);
			expect(new URL(page.url()).pathname).toBe('/');

			// The drawer carries no sign-in link.
			const drawer = await openDrawer(page);
			await expect(drawer.getByRole('link', { name: /sign\s*in/i })).toHaveCount(0);
			await expect(page.locator('a[href="/sign-in"]')).toHaveCount(0);
		});
	});

	// ═══════════════════════════════════════════════
	// MOBILE HOMEPAGE (V2a)
	// ═══════════════════════════════════════════════

	test.describe('Mobile Homepage', () => {
		test('day header renders weekday/ordinal (or TODAY) in first day section', async ({ page }) => {
			await page.goto(BASE);
			// Mobile now renders the same day shell as desktop: section.day with a
			// black .day-header band wrapping an h2. The first group is usually
			// TODAY; later groups read "{WEEKDAY} THE {ordinal} OF {MONTH}".
			const firstHeader = page.locator('section.day .day-header h2').first();
			await expect(firstHeader).toBeVisible();
			const text = (await firstHeader.textContent())?.toLowerCase() ?? '';
			expect(text).toMatch(/today|monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
		});

		test('top bar keeps ALL / NEW / REP and search on screen', async ({ page }) => {
			await page.goto(BASE);
			// On phone widths the top bar carries the burger, ALL / NEW / REP and
			// search; the day pills and deeper filters wait in the closed drawer.
			const programme = page.getByRole('radiogroup', { name: 'Programme' });
			for (const label of ['All', 'New', 'Rep']) {
				await expect(programme.getByRole('radio', { name: new RegExp(`^${label}`) })).toBeVisible();
			}
			await expect(
				page.getByRole('searchbox', { name: 'Search films, cinemas and directors' })
			).toBeVisible();
			await expect(burger(page)).toBeVisible();

			// The day pills exist in the DOM inside the hidden drawer, out of the
			// a11y tree until the burger opens it.
			const days = page.locator('[role="group"][aria-label="Day"]');
			await expect(days).toBeAttached();
			await expect(days).toBeHidden();
		});

		test('top bar search input is ≥16px (prevents iOS auto-zoom)', async ({ page }) => {
			await page.goto(BASE);
			const searchInput = page.getByRole('searchbox', { name: 'Search films, cinemas and directors' });
			await expect(searchInput).toBeVisible();
			const fontSize = await searchInput.evaluate(
				(el) => parseFloat(window.getComputedStyle(el as HTMLElement).fontSize)
			);
			expect(fontSize).toBeGreaterThanOrEqual(16);
		});

		test('Done button closes the drawer', async ({ page }) => {
			await gotoHomeHydrated(page);
			const drawer = await openDrawer(page);
			await drawer.getByRole('button', { name: /^Done/ }).click();
			await expect(drawer).toBeHidden();
		});

		test('drawer traps focus and restores it to the burger', async ({ page }) => {
			await gotoHomeHydrated(page);
			const drawer = await openDrawer(page, { keyboard: true });
			const first = drawer.getByRole('link', { name: 'pictures london, what’s on' });
			const done = drawer.getByRole('button', { name: /^Done/ });

			await expect(first).toBeFocused();
			await page.keyboard.press('Shift+Tab');
			await expect(done).toBeFocused();
			await page.keyboard.press('Tab');
			await expect(first).toBeFocused();

			await done.click();
			await expect(drawer).toBeHidden();
			await expect(burger(page)).toBeFocused();
		});

		test('Escape key dismisses the drawer', async ({ page }) => {
			await gotoHomeHydrated(page);
			const drawer = await openDrawer(page);
			await page.keyboard.press('Escape');
			await expect(drawer).toBeHidden();
		});

		test('body scroll is locked while the drawer is open', async ({ page }) => {
			await gotoHomeHydrated(page);
			const prev = await page.evaluate(() => document.body.style.overflow);
			const drawer = await openDrawer(page);
			const locked = await page.evaluate(() => document.body.style.overflow);
			expect(locked).toBe('hidden');
			await drawer.getByRole('button', { name: /^Done/ }).click();
			await expect(drawer).toBeHidden();
			const restored = await page.evaluate(() => document.body.style.overflow);
			expect(restored).toBe(prev);
		});

		test('cinema search exposes selectable matching cinemas', async ({ page }) => {
			await gotoHomeHydrated(page);
			const drawer = await openDrawer(page);
			await drawer.getByRole('searchbox', { name: 'Search cinemas or areas' }).fill('Curzon');

			const results = drawer.locator('.results .chip');
			await expect(results.first()).toBeVisible();
			expect(await results.count()).toBeGreaterThan(0);

			const labels = await results.allTextContents();
			expect(labels.every((label) => label.toLowerCase().includes('curzon'))).toBe(true);

			await results.first().click();
			await expect(results.first()).toHaveAttribute('aria-pressed', 'true');
		});

		test('Pick a date inside the drawer opens the date picker over it', async ({ page }) => {
			await gotoHomeHydrated(page);
			const drawer = await openDrawer(page);
			const trigger = drawer.getByRole('button', { name: 'Pick a date' });
			await trigger.click();

			const datePicker = page.getByRole('dialog', { name: 'Pick a date' });
			await expect(datePicker).toBeVisible();
			await expect(datePicker.getByRole('button', { name: 'Previous month' })).toBeFocused();

			await page.keyboard.press('Escape');
			await expect(datePicker).toBeHidden();
			await expect(trigger).toBeFocused();
			await expect(drawer).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// FILM CARDS
	// ═══════════════════════════════════════════════

	test.describe('Film Cards', () => {
		test('film cards render stacked vertically on mobile', async ({ page }) => {
			await page.goto(BASE);
			// Mobile now renders the same shell as desktop: section.day > .film-row >
			// article.card, with .film-row stacking column-wise below 768px.
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 10000 });

			const cards = page.locator('section.day .film-row article.card');
			const count = await cards.count();
			expect(count).toBeGreaterThan(1);

			const first = await cards.nth(0).boundingBox();
			const second = await cards.nth(1).boundingBox();
			expect(second!.y).toBeGreaterThan(first!.y + 10);
		});

		test('screening times in film card are readable and within viewport', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 10000 });

			const time = page.locator('section.day article.card .screening-time').first();
			const box = await time.boundingBox();
			const viewport = await page.evaluate(() => window.innerWidth);
			expect(box!.x + box!.width).toBeLessThanOrEqual(viewport);
			expect(box!.height).toBeGreaterThanOrEqual(14);
		});
	});

	// ═══════════════════════════════════════════════
	// FILM DETAIL PAGE
	// ═══════════════════════════════════════════════

	test.describe('Film Detail Page', () => {
		test('poster and info stack vertically on mobile', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 10000 });
			// The poster is the first link on the card; navigate to the film page.
			await page.locator('section.day article.card a[href^="/film/"]').first().click();
			await page.waitForURL(/\/film\//);

			const poster = page.locator('.poster-col').first();
			const title = page.locator('h1.film-title').first();
			if (await poster.isVisible()) {
				const posterBox = await poster.boundingBox();
				const titleBox = await title.boundingBox();
				expect(titleBox!.y).toBeGreaterThan(posterBox!.y);
			}
		});

		test('primary booking CTA is tappable (≥28px)', async ({ page }) => {
			// The standalone iCal/add-to-calendar button was removed from the film
			// detail page. The hero now leads with a "Book next showing" primary CTA
			// (plus a Save toggle); assert that CTA is a comfortable tap target.
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 10000 });
			await page.locator('section.day article.card a[href^="/film/"]').first().click();
			await page.waitForURL(/\/film\//);

			const cta = page.locator('.cta').first();
			if (await cta.isVisible()) {
				const box = await cta.boundingBox();
				expect(box!.width).toBeGreaterThanOrEqual(28);
				expect(box!.height).toBeGreaterThanOrEqual(28);
			}
		});
	});

	// ═══════════════════════════════════════════════
	// MOBILE NAVIGATION
	// ═══════════════════════════════════════════════

	test.describe('Mobile Navigation', () => {
		test('burger opens the drawer and shows nav links', async ({ page }) => {
			await page.goto(BASE);
			const drawer = await openDrawer(page);

			const nav = drawer.getByRole('navigation', { name: 'Main' });
			for (const name of ['What’s on', 'Cinemas', 'Reachable', 'Watchlist']) {
				await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
			}
		});

		test('drawer nav links have adequate touch targets (44px min)', async ({ page }) => {
			await page.goto(BASE);
			const drawer = await openDrawer(page);

			const links = drawer.getByRole('navigation', { name: 'Main' }).getByRole('link');
			const count = await links.count();
			expect(count).toBeGreaterThan(0);

			for (let i = 0; i < count; i++) {
				const box = await links.nth(i).boundingBox();
				expect(box!.height).toBeGreaterThanOrEqual(44);
			}
		});

		test('drawer closes after navigation', async ({ page }) => {
			await page.goto(BASE);
			const drawer = await openDrawer(page);

			await drawer.getByRole('navigation', { name: 'More' }).getByRole('link', { name: 'About' }).click();
			await page.waitForURL(/\/about/);
			await expect(drawer).toBeHidden();
			await expect(page.locator('#site-sidebar')).toBeHidden();
		});
	});

	// ═══════════════════════════════════════════════
	// TOUCH TARGETS
	// ═══════════════════════════════════════════════

	test.describe('Touch Targets', () => {
		test('cinema cards have minimum 48px height on cinemas page', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await page.waitForSelector('.cinema-card', { timeout: 10000 });

			const cards = page.locator('.cinema-card');
			const count = await cards.count();
			expect(count).toBeGreaterThan(0);

			const box = await cards.first().boundingBox();
			expect(box!.height).toBeGreaterThanOrEqual(48);
		});
	});

	// ═══════════════════════════════════════════════
	// OTHER PAGES
	// ═══════════════════════════════════════════════

	test.describe('Other Pages at Mobile Width', () => {
		for (const path of ['/', '/festivals', '/search?q=godfather', '/tonight', '/settings']) {
			test(`${path} renders without horizontal overflow`, async ({ page }) => {
				await expectNoOverflow(page, path);
			});
		}

		test('letterboxd page input and button fit', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			await expect(page.getByPlaceholder('your-username')).toBeVisible();
			await expect(page.getByRole('button', { name: 'IMPORT' })).toBeVisible();

			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});

		test('map page fills viewport height', async ({ page }) => {
			await page.goto(`${BASE}/map`);
			await page.waitForTimeout(2000);
			const mapContainer = page.locator('.map-container');
			await expect(mapContainer).toBeVisible();
			const box = await mapContainer.boundingBox();
			expect(box!.height).toBeGreaterThan(300);
		});
	});
});

// ═══════════════════════════════════════════════════════
// SMALL ANDROID (360x640) — Extra narrow viewport
// ═══════════════════════════════════════════════════════

test.describe('Small Android (360x640)', () => {
	test.use({ viewport: { width: 360, height: 640 } });

	for (const path of ['/', '/reachable', '/tonight']) {
		test(`${path} has no horizontal overflow at 360px`, async ({ page }) => {
			await expectNoOverflow(page, path);
		});
	}

	test('THE SLEEPER marker fits the rail without clipping or overflow', async ({ page }) => {
		// The real mobile risks are the vertical text outgrowing a shorter rail
		// and the marker pushing the page into horizontal scroll. At 360px the
		// card goes full-width, so the rail is narrower than desktop's 64px.
		await page.goto(BASE);
		await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 15000 });

		const marker = page.locator('article.card .rail-sleeper').first();
		test.skip((await marker.count()) === 0, 'no sleeper pick in the current window');

		const viewport = await page.evaluate(() => window.innerWidth);
		const box = (await marker.boundingBox())!;
		expect(box.x + box.width).toBeLessThanOrEqual(viewport);

		// Vertical writing-mode text must not be cut off by its cell.
		const clipped = await marker.evaluate((el) => {
			const t = el.querySelector('.rail-sleeper-text') as HTMLElement;
			return t.scrollHeight > el.clientHeight + 1 || t.scrollWidth > el.clientWidth + 1;
		});
		expect(clipped).toBe(false);

		expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(viewport + 1);
	});
});
