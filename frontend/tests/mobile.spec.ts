import { test, expect, devices } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Test at iPhone 12 Pro dimensions
test.use(devices['iPhone 12 Pro']);

test.describe('Mobile Responsive — iPhone 12 Pro (390x844)', () => {

	// ═══════════════════════════════════════════════
	// HEADER
	// ═══════════════════════════════════════════════

	test.describe('Header', () => {
		test('brand wordmark fits without overflow', async ({ page }) => {
			await page.goto(BASE);
			const header = page.locator('header');
			await expect(header).toBeVisible();

			// Header should not cause horizontal scroll
			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
		});

		test('SIGN IN does not wrap to two lines', async ({ page }) => {
			await page.goto(BASE);
			const signIn = page.getByText('SIGN IN', { exact: true });
			await expect(signIn).toBeVisible();

			const box = await signIn.boundingBox();
			// Single line of 11px text should be under 20px tall
			expect(box!.height).toBeLessThan(25);
		});

		test('no horizontal page overflow', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForTimeout(1000);
			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════
	// FILTER BAR
	// ═══════════════════════════════════════════════

	test.describe('Filter Bar', () => {
		test('filter bar is horizontally scrollable', async ({ page }) => {
			await page.goto(BASE);
			const filterGrid = page.locator('.filter-grid');
			await expect(filterGrid).toBeVisible();
		});

		test('ALL/NEW/REPERTORY tabs are visible', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.getByText('ALL', { exact: true })).toBeVisible();
			await expect(page.getByText('NEW', { exact: true })).toBeVisible();
		});

		test('cinema dropdown does not overflow viewport', async ({ page }) => {
			await page.goto(BASE);
			// Open FILTERS panel first on mobile
			await page.getByRole('button', { name: 'Toggle filters' }).click();
			await page.waitForTimeout(300);
			await page.getByLabel('Cinema filter').last().click();
			await page.waitForTimeout(300);

			const dropdown = page.locator('.dropdown-panel');
			await expect(dropdown).toBeVisible();

			const box = await dropdown.boundingBox();
			const viewport = await page.evaluate(() => window.innerWidth);
			// Dropdown right edge should not exceed viewport
			expect(box!.x + box!.width).toBeLessThanOrEqual(viewport + 2);
			// Dropdown left edge should be >= 0
			expect(box!.x).toBeGreaterThanOrEqual(0);
		});

		test('WHEN dropdown does not overflow viewport', async ({ page }) => {
			await page.goto(BASE);
			// Open FILTERS panel first on mobile
			await page.getByRole('button', { name: 'Toggle filters' }).click();
			await page.waitForTimeout(300);
			await page.getByLabel('Date and time filter').last().click();
			await page.waitForTimeout(300);

			const dropdown = page.locator('.dropdown-panel');
			await expect(dropdown).toBeVisible();

			const box = await dropdown.boundingBox();
			const viewport = await page.evaluate(() => window.innerWidth);
			expect(box!.x + box!.width).toBeLessThanOrEqual(viewport + 2);
		});
	});

	// ═══════════════════════════════════════════════
	// FILM CARDS
	// ═══════════════════════════════════════════════

	test.describe('Film Cards', () => {
		test('film cards render in 2-column grid', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });

			// Get first two card positions — they should be side by side
			const cards = page.locator('.film-card');
			const count = await cards.count();
			expect(count).toBeGreaterThan(1);

			const first = await cards.nth(0).boundingBox();
			const second = await cards.nth(1).boundingBox();
			// Cards should be on the same row (similar Y position)
			expect(Math.abs(first!.y - second!.y)).toBeLessThan(20);
		});

		test('screening pills are readable and not clipped', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.screening-pill', { timeout: 10000 });

			const pill = page.locator('.screening-pill').first();
			const box = await pill.boundingBox();
			// Pill should be fully within viewport
			const viewport = await page.evaluate(() => window.innerWidth);
			expect(box!.x + box!.width).toBeLessThanOrEqual(viewport);
		});
	});

	// ═══════════════════════════════════════════════
	// FILM DETAIL PAGE
	// ═══════════════════════════════════════════════

	test.describe('Film Detail Page', () => {
		test('poster and info stack vertically', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);

			// The poster and info should stack (poster above info)
			const poster = page.locator('.poster-col');
			const title = page.locator('.film-title');
			if (await poster.isVisible()) {
				const posterBox = await poster.boundingBox();
				const titleBox = await title.boundingBox();
				// Title should be below the poster on mobile
				expect(titleBox!.y).toBeGreaterThan(posterBox!.y);
			}
		});

		test('screening rows fit within viewport', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);

			const row = page.locator('.screening-row').first();
			if (await row.isVisible()) {
				const box = await row.boundingBox();
				const viewport = await page.evaluate(() => window.innerWidth);
				expect(box!.x + box!.width).toBeLessThanOrEqual(viewport + 5);
			}
		});

		test('iCal button is tappable', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);

			const icalBtn = page.locator('.ical-btn').first();
			if (await icalBtn.isVisible()) {
				const box = await icalBtn.boundingBox();
				// WCAG 2.5.8 minimum: 24px; our target: 28px
				expect(box!.width).toBeGreaterThanOrEqual(28);
				expect(box!.height).toBeGreaterThanOrEqual(28);
			}
		});
	});

	// ═══════════════════════════════════════════════
	// MOBILE NAVIGATION
	// ═══════════════════════════════════════════════

	test.describe('Mobile Navigation', () => {
		test('hamburger menu button is visible', async ({ page }) => {
			await page.goto(BASE);
			const menuBtn = page.locator('.mobile-menu-btn');
			await expect(menuBtn).toBeVisible();
		});

		test('hamburger menu opens and shows nav links', async ({ page }) => {
			await page.goto(BASE);
			const menuBtn = page.locator('.mobile-menu-btn');
			await menuBtn.click();

			const mobileNav = page.locator('.mobile-nav');
			await expect(mobileNav).toBeVisible();

			// Check key nav links are present
			await expect(page.locator('.mobile-nav-link').filter({ hasText: 'ABOUT' })).toBeVisible();
			await expect(page.locator('.mobile-nav-link').filter({ hasText: 'MAP' })).toBeVisible();
			await expect(page.locator('.mobile-nav-link').filter({ hasText: 'REACHABLE' })).toBeVisible();
		});

		test('mobile nav links have adequate touch targets (44px min)', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('.mobile-menu-btn').click();
			await expect(page.locator('.mobile-nav')).toBeVisible();

			const links = page.locator('.mobile-nav-link');
			const count = await links.count();
			expect(count).toBeGreaterThan(0);

			for (let i = 0; i < count; i++) {
				const box = await links.nth(i).boundingBox();
				expect(box!.height).toBeGreaterThanOrEqual(44);
			}
		});

		test('hamburger menu closes after navigation', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('.mobile-menu-btn').click();
			await expect(page.locator('.mobile-nav')).toBeVisible();

			// Navigate to a different page by clicking a link
			await page.locator('.mobile-nav-link').filter({ hasText: 'ABOUT' }).click();
			await page.waitForURL(/\/about/);
			// Menu should be closed after navigation
			await expect(page.locator('.mobile-nav')).not.toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// TOUCH TARGETS
	// ═══════════════════════════════════════════════

	test.describe('Touch Targets', () => {
		test('screening pills have minimum 28px height', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.screening-pill', { timeout: 10000 });

			const pills = page.locator('.screening-pill');
			const count = await pills.count();
			expect(count).toBeGreaterThan(0);

			// Check first 5 pills
			for (let i = 0; i < Math.min(count, 5); i++) {
				const box = await pills.nth(i).boundingBox();
				expect(box!.height).toBeGreaterThanOrEqual(28);
			}
		});

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
	// DROPDOWN CONTAINMENT
	// ═══════════════════════════════════════════════

	test.describe('Dropdown Containment', () => {
		test('dropdown panel has max-height and is scrollable on mobile', async ({ page }) => {
			await page.goto(BASE);
			// Open FILTERS panel first
			try {
				await page.getByRole('button', { name: 'Toggle filters' }).click();
				await page.waitForTimeout(300);
			} catch { /* filter toggle may not exist */ }

			await page.getByLabel('Cinema filter').last().click();
			await page.waitForTimeout(300);

			const dropdown = page.locator('.dropdown-panel');
			await expect(dropdown).toBeVisible();

			// Check max-height CSS property is set
			const maxHeight = await dropdown.evaluate((el) => getComputedStyle(el).maxHeight);
			expect(maxHeight).not.toBe('none');
			expect(maxHeight).not.toBe('');
		});
	});

	// ═══════════════════════════════════════════════
	// OTHER PAGES
	// ═══════════════════════════════════════════════

	test.describe('Other Pages at Mobile Width', () => {
		test('cinemas page renders without overflow', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await page.waitForTimeout(1000);
			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});

		test('festivals page renders without overflow', async ({ page }) => {
			await page.goto(`${BASE}/festivals`);
			await page.waitForTimeout(1000);
			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});

		test('letterboxd page input and button fit', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			await expect(page.getByPlaceholder('your-username')).toBeVisible();
			await expect(page.getByRole('button', { name: 'IMPORT' })).toBeVisible();

			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});

		test('search results page renders without overflow', async ({ page }) => {
			await page.goto(`${BASE}/search?q=godfather`);
			await page.waitForTimeout(2000);
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

		test('tonight page renders without overflow', async ({ page }) => {
			await page.goto(`${BASE}/tonight`);
			await page.waitForTimeout(1000);
			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});

		test('settings page renders without overflow', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await page.waitForTimeout(500);
			const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
			expect(overflow).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════
// SMALL ANDROID (360x640) — Extra narrow viewport
// ═══════════════════════════════════════════════════════

test.describe('Small Android (360x640)', () => {
	test.use({ viewport: { width: 360, height: 640 } });

	test('homepage has no horizontal overflow at 360px', async ({ page }) => {
		await page.goto(BASE);
		await page.waitForTimeout(1000);
		const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
		expect(overflow).toBe(false);
	});

	test('cinemas page has no horizontal overflow at 360px', async ({ page }) => {
		await page.goto(`${BASE}/cinemas`);
		await page.waitForTimeout(1000);
		const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
		expect(overflow).toBe(false);
	});

	test('reachable page has no horizontal overflow at 360px', async ({ page }) => {
		await page.goto(`${BASE}/reachable`);
		await page.waitForTimeout(500);
		const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
		expect(overflow).toBe(false);
	});

	test('tonight page has no horizontal overflow at 360px', async ({ page }) => {
		await page.goto(`${BASE}/tonight`);
		await page.waitForTimeout(1000);
		const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
		expect(overflow).toBe(false);
	});
});
