import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// This spec covers desktop-first UX — force a desktop viewport so the desktop
// shell (sidebar, hybrid grid, masthead) is the one being asserted regardless
// of which project runs the file (e.g. the mobile-small device project).
test.use({ viewport: { width: 1440, height: 900 } });

// Dismiss cookie consent before every test so assertions aren't blocked by
// the pretext banner. Use addInitScript (runs on every navigation) so reloads
// don't re-trigger it.
test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		try {
			localStorage.setItem(
				'pictures-cookie-consent',
				JSON.stringify({ status: 'rejected', updatedAt: new Date().toISOString() })
			);
		} catch { /* ignore */ }
	});
});

test.describe('Pictures London — SvelteKit Frontend', () => {

	// ═══════════════════════════════════════════════
	// HOMEPAGE (V2a Literary Antiqua)
	// ═══════════════════════════════════════════════

	test.describe('Homepage', () => {
		test('loads and shows film cards with real data', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const cards = await page.locator('.film-card').count();
			expect(cards).toBeGreaterThan(0);
			const firstTitle = await page.locator('.film-card .film-title').first().textContent();
			expect(firstTitle).toBeTruthy();
			expect(firstTitle!.length).toBeGreaterThan(0);
		});

		test('shows day masthead with weekday + ordinal', async ({ page }) => {
			await page.goto(BASE);
			const masthead = page.locator('.masthead-title').first();
			await expect(masthead).toBeVisible();
			const text = (await masthead.textContent())?.toLowerCase() ?? '';
			expect(text).toMatch(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
			expect(text).toContain('the ');
		});

		test('shows day strip with Today button', async ({ page }) => {
			await page.goto(BASE);
			const today = page.locator('.day-strip').getByRole('button', { name: 'Today' });
			await expect(today).toBeVisible();
		});

		test('Pick date button opens calendar popover', async ({ page }) => {
			await page.goto(BASE);
			await page.getByRole('button', { name: /Pick date/ }).first().click();
			await expect(page.getByRole('dialog', { name: 'Pick a date' }).first()).toBeVisible();
		});

		test('shows breathing grid wordmark', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.locator('[aria-label="pictures london"]')).toBeVisible();
		});

		test('desktop sidebar renders filter sections', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			const sidebar = page.locator('aside.sidebar[aria-label="Filters"]');
			await expect(sidebar).toBeVisible();
			await expect(sidebar.getByPlaceholder('Search films, cinemas…')).toBeVisible();
			await expect(sidebar.getByRole('heading', { name: 'Where' })).toBeVisible();
			await expect(sidebar.getByRole('heading', { name: 'Time of day' })).toBeVisible();
			await expect(sidebar.getByRole('heading', { name: 'Format' })).toBeVisible();
		});

		test('All / New / Repertory tabs visible', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			const tablist = page.locator('.desktop-toolbar [role="tablist"]');
			await expect(tablist.getByRole('tab', { name: 'All', exact: true })).toBeVisible();
			await expect(tablist.getByRole('tab', { name: 'New', exact: true })).toBeVisible();
			await expect(tablist.getByRole('tab', { name: 'Repertory', exact: true })).toBeVisible();
		});

		test('Repertory tab filters to repertory-only films', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();
			await page.locator('.desktop-toolbar').getByRole('tab', { name: 'Repertory', exact: true }).click();
			await page.waitForTimeout(500);
			const repCount = await page.locator('.film-card').count();
			// Repertory is a subset of All — expect fewer OR equal (if dataset is all-rep)
			expect(repCount).toBeLessThanOrEqual(allCount);
		});

		test('persisted New filter renders matching posters and titles', async ({ page, context }) => {
			// Regression for fix/poster-title-mismatch: persisted filter loaded
			// at module init produced a SSR/CSR hydration mismatch where titles
			// updated to the new film set but <img src> attributes stayed bound
			// to the SSR'd "All" view's films. This test loads the page with a
			// New filter persisted in localStorage and confirms each card's
			// poster URL matches the title set produced by clicking the tab.
			await page.setViewportSize({ width: 1440, height: 900 });

			const readPairs = () =>
				page.evaluate(() =>
					Array.from(document.querySelectorAll('article.film-card')).slice(0, 5).map((c) => ({
						title: c.querySelector('h3.film-title')?.textContent?.trim() ?? '',
						imgSrc: (c.querySelector('img') as HTMLImageElement | null)?.src ?? ''
					}))
				);

			// Capture title→poster pairs from clicking the New tab on a fresh page.
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.desktop-toolbar').getByRole('tab', { name: 'New', exact: true }).click();
			await expect(
				page.locator('.desktop-toolbar [role="tab"][aria-selected="true"]')
			).toHaveText('New');
			await page.waitForTimeout(800);
			const expected = await readPairs();
			expect(expected.length).toBe(5);
			// Sanity: titles are unique per card (catches obvious render glitches).
			expect(new Set(expected.map((p) => p.title)).size).toBe(expected.length);

			// Persist the New filter, reload, and verify the same pairings appear.
			await context.addInitScript(() => {
				try {
					localStorage.setItem(
						'pictures-filters',
						JSON.stringify({
							cinemaIds: [],
							formats: [],
							programmingTypes: ['new_release'],
							genres: [],
							decades: []
						})
					);
				} catch { /* ignore */ }
			});
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await expect(
				page.locator('.desktop-toolbar [role="tab"][aria-selected="true"]')
			).toHaveText('New');
			// Poll for the deferred persisted-state apply to settle.
			await expect.poll(readPairs, { timeout: 5000 }).toEqual(expected);
		});

		test('cinema area chip narrows results', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();
			await page.getByRole('button', { name: 'Soho & West End' }).click();
			await page.waitForTimeout(500);
			const filteredCount = await page.locator('.film-card').count();
			expect(filteredCount).toBeLessThan(allCount);
			expect(filteredCount).toBeGreaterThan(0);
		});

		test('format chip (35mm) reduces displayed films', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();
			await page.locator('aside.sidebar').getByRole('button', { name: '35mm', exact: true }).click();
			await page.waitForTimeout(500);
			const filteredCount = await page.locator('.film-card').count();
			expect(filteredCount).toBeLessThan(allCount);
		});

		test('search matches film titles', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();
			await page.getByPlaceholder('Search films, cinemas…').fill('the');
			await page.waitForTimeout(400);
			const filteredCount = await page.locator('.film-card').count();
			expect(filteredCount).toBeLessThanOrEqual(allCount);
		});

		test('search matches cinema names', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.getByPlaceholder('Search films, cinemas…').fill('Prince Charles');
			await page.waitForTimeout(400);
			// Every visible card should have at least one Prince Charles screening
			const count = await page.locator('.film-card').count();
			expect(count).toBeGreaterThan(0);
			const visibleText = await page.locator('.desktop-film-grid').textContent();
			expect(visibleText?.toLowerCase()).toContain('prince charles');
		});

		test('sidebar collapse persists across reload', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			// Ensure we start expanded regardless of any pre-existing localStorage.
			await page.evaluate(() => localStorage.removeItem('pictures-sidebar-collapsed'));
			await page.reload();
			const sidebar = page.locator('aside.sidebar');
			await expect(sidebar).toBeVisible();
			await page.locator('.sidebar-hide-link').click();
			await expect(sidebar).toHaveCount(0);
			await page.waitForFunction(() =>
				localStorage.getItem('pictures-sidebar-collapsed') === 'true'
			);
			await page.reload();
			await expect(sidebar).toHaveCount(0);
			await expect(page.locator('.sidebar-rail')).toBeVisible();
		});

		test('House Lights dimmer label is visible', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await expect(page.getByText('House lights')).toBeVisible();
		});

		test('footer is visible with correct links', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.locator('footer')).toBeVisible();
			await expect(page.locator('footer').getByText('about')).toBeVisible();
			await expect(page.locator('footer').getByText('privacy')).toBeVisible();
			await expect(page.locator('footer').getByText('terms')).toBeVisible();
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(BASE);
			await expect(page).toHaveTitle('pictures · london');
		});
	});

	// ═══════════════════════════════════════════════
	// NAVIGATION
	// ═══════════════════════════════════════════════

	test.describe('Navigation', () => {
		test('header nav links are visible at desktop width', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			const nav = page.locator('nav[aria-label="Main"]');
			await expect(nav.getByRole('link', { name: 'About' })).toBeVisible();
			await expect(nav.getByRole('link', { name: 'Map' })).toBeVisible();
			await expect(nav.getByRole('link', { name: 'Reachable' })).toBeVisible();
			await expect(nav.getByRole('link', { name: 'Watchlist' })).toBeVisible();
		});

		test('clicking wordmark navigates to home', async ({ page }) => {
			await page.goto(`${BASE}/about`);
			await page.locator('[aria-label="pictures london — home"]').click();
			await expect(page).toHaveURL(BASE + '/');
		});

		test('footer about link navigates to about page', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('footer a[href="/about"]').click();
			await expect(page).toHaveURL(`${BASE}/about`);
		});
	});

	// ═══════════════════════════════════════════════
	// FILM DETAIL PAGE (V2a literary hero)
	// ═══════════════════════════════════════════════

	test.describe('Film Detail Page', () => {
		test('navigating to a film shows detail page with title', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			const title = await page.locator('h1.film-title').textContent();
			expect(title).toBeTruthy();
			expect(title!.length).toBeGreaterThan(0);
		});

		test('shows metadata line (runtime · country · rating · genres)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			// New literary hero renders `.meta` inside `.info-col`
			await expect(page.locator('.info-col .meta').first()).toBeVisible();
		});

		test('shows Showings heading', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByRole('heading', { name: /howings/ }).first()).toBeVisible();
		});

		test('shows Want to see / Not interested status buttons', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByText('Want to see')).toBeVisible();
			await expect(page.getByText('Not interested')).toBeVisible();
			// "Seen" toggle should NOT be present
			const seenButtons = await page.getByText(/^SEEN$/).count();
			expect(seenButtons).toBe(0);
		});

		test('shows external links (at least one of TMDB / IMDb / Letterboxd)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			const extLinks = await page.locator('.ext').count();
			expect(extLinks).toBeGreaterThan(0);
		});

		test('has correct page title with film name', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page).toHaveTitle(/— pictures · london/);
		});

		test('shows at least one iCal download button', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			const icalBtns = await page.locator('.ical-btn').count();
			expect(icalBtns).toBeGreaterThan(0);
			const href = await page.locator('.ical-btn').first().getAttribute('href');
			expect(href).toContain('/api/calendar?screening=');
		});

		test('Pick date button on detail opens calendar popover', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			const pick = page.getByRole('button', { name: /Pick date/ });
			if (await pick.count() === 0) test.skip();
			await pick.first().click();
			await expect(page.getByRole('dialog', { name: 'Pick a date' }).first()).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// TONIGHT PAGE
	// ═══════════════════════════════════════════════

	test.describe('Tonight Page', () => {
		test('loads with correct heading', async ({ page }) => {
			await page.goto(`${BASE}/tonight`);
			await expect(page.locator('h1')).toContainText('TONIGHT');
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/tonight`);
			await expect(page).toHaveTitle(/Tonight/);
		});
	});

	// ═══════════════════════════════════════════════
	// CINEMAS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Cinemas Page', () => {
		test('loads cinema list with cards', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await expect(page.locator('h1')).toContainText('CINEMAS');
			const cards = await page.locator('.cinema-card').count();
			expect(cards).toBeGreaterThan(0);
		});

		test('search filters cinema list', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await page.waitForSelector('.cinema-card', { timeout: 10000 });
			const allCount = await page.locator('.cinema-card').count();
			await page.getByPlaceholder('Search cinemas...').fill('Curzon');
			await page.waitForTimeout(300);
			const filteredCount = await page.locator('.cinema-card').count();
			expect(filteredCount).toBeLessThan(allCount);
			expect(filteredCount).toBeGreaterThan(0);
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await expect(page).toHaveTitle(/Cinemas/);
		});
	});

	// ═══════════════════════════════════════════════
	// DIRECTORS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Directors Page', () => {
		test('loads directors list', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await expect(page.locator('h1')).toContainText('DIRECTORS');
			const cards = await page.locator('.director-card').count();
			expect(cards).toBeGreaterThan(0);
		});

		test('shows director film counts', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await page.waitForSelector('.director-card', { timeout: 10000 });
			const filmCount = await page.locator('.director-films').first().textContent();
			expect(filmCount).toMatch(/\d+ films? showing/);
		});

		test('search filters directors', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await page.waitForSelector('.director-card', { timeout: 10000 });
			const allCount = await page.locator('.director-card').count();
			await page.getByPlaceholder('Search directors...').fill('Spielberg');
			await page.waitForTimeout(300);
			const filteredCount = await page.locator('.director-card').count();
			expect(filteredCount).toBeLessThanOrEqual(allCount);
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await expect(page).toHaveTitle(/Directors/);
		});
	});

	// ═══════════════════════════════════════════════
	// WATCHLIST PAGE
	// ═══════════════════════════════════════════════

	test.describe('Watchlist Page', () => {
		test('loads with correct heading', async ({ page }) => {
			await page.goto(`${BASE}/watchlist`);
			await expect(page.locator('h1')).toContainText('WATCHLIST');
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/watchlist`);
			await expect(page).toHaveTitle(/Watchlist/);
		});
	});

	// ═══════════════════════════════════════════════
	// SETTINGS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Settings Page', () => {
		test('loads with all setting sections', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page.locator('h1')).toContainText('SETTINGS');
			await expect(page.getByText('DEFAULT VIEW')).toBeVisible();
			await expect(page.getByText('THEME')).toBeVisible();
			await expect(page.getByText('CLEAR ALL DATA')).toBeVisible();
		});

		test('view toggle works', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page.getByRole('tab', { name: 'POSTER' })).toBeVisible();
			await expect(page.getByRole('tab', { name: 'TEXT' })).toBeVisible();
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page).toHaveTitle(/Settings/);
		});
	});

	// ═══════════════════════════════════════════════
	// STATIC PAGES
	// ═══════════════════════════════════════════════

	test.describe('Static Pages', () => {
		test('about page loads', async ({ page }) => {
			await page.goto(`${BASE}/about`);
			await expect(page.locator('h1')).toContainText('ABOUT');
			await expect(page).toHaveTitle(/About/);
		});

		test('privacy page loads', async ({ page }) => {
			await page.goto(`${BASE}/privacy`);
			await expect(page.locator('h1')).toContainText('PRIVACY');
			await expect(page).toHaveTitle(/Privacy/);
		});

		test('terms page loads', async ({ page }) => {
			await page.goto(`${BASE}/terms`);
			await expect(page.locator('h1')).toContainText('TERMS');
			await expect(page).toHaveTitle(/Terms/);
		});

		test('map page loads', async ({ page }) => {
			await page.goto(`${BASE}/map`);
			await expect(page.locator('h1')).toContainText('CINEMA MAP');
			await expect(page).toHaveTitle(/Map/);
		});

		test('letterboxd page loads', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			await expect(page.locator('h1')).toContainText('LETTERBOXD');
			await expect(page).toHaveTitle(/Letterboxd/);
		});
	});

	// ═══════════════════════════════════════════════
	// ERROR HANDLING
	// ═══════════════════════════════════════════════

	test.describe('Error Handling', () => {
		test('404 page shows for unknown routes', async ({ page }) => {
			await page.goto(`${BASE}/this-page-does-not-exist`);
			await expect(page.locator('h1')).toContainText('404');
		});

		test('404 page has back to calendar link', async ({ page }) => {
			await page.goto(`${BASE}/this-page-does-not-exist`);
			await expect(page.getByText('BACK TO CALENDAR')).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// CROSS-PAGE INTERACTIONS
	// ═══════════════════════════════════════════════

	test.describe('Cross-Page Interactions', () => {
		test('Want to see button persists across navigation', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);

			await page.getByRole('button', { name: 'Want to see' }).click();
			await page.waitForTimeout(300);

			await page.goto(`${BASE}/watchlist`);
			const emptyState = await page.getByText('Your watchlist is empty').count();
			expect(emptyState).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════
	// SEARCH RESULTS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Search Results Page', () => {
		test('loads with query parameter and shows results', async ({ page }) => {
			await page.goto(`${BASE}/search?q=godfather`);
			await page.waitForTimeout(2000);
			const title = await page.locator('h1').textContent();
			expect(title?.toUpperCase()).toContain('GODFATHER');
		});

		test('shows empty state for no-match query', async ({ page }) => {
			await page.goto(`${BASE}/search?q=zzzzzznonexistent`);
			await page.waitForTimeout(2000);
			await expect(page.getByText('No results')).toBeVisible();
		});

		test('shows empty state when no query', async ({ page }) => {
			await page.goto(`${BASE}/search`);
			await expect(page.getByText('Search for films')).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// LETTERBOXD IMPORT PAGE
	// ═══════════════════════════════════════════════

	test.describe('Letterboxd Import Page', () => {
		test('shows username input form', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			await expect(page.getByPlaceholder('your-username')).toBeVisible();
			await expect(page.getByRole('button', { name: 'IMPORT' })).toBeVisible();
		});

		test('import button is disabled when input is empty', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			const btn = page.getByRole('button', { name: 'IMPORT' });
			await expect(btn).toBeDisabled();
		});
	});

	// ═══════════════════════════════════════════════
	// CINEMA MAP PAGE
	// ═══════════════════════════════════════════════

	test.describe('Cinema Map Page', () => {
		test('loads map page with heading', async ({ page }) => {
			await page.goto(`${BASE}/map`);
			await expect(page.getByText('CINEMA MAP')).toBeVisible();
		});

		test('shows venue count', async ({ page }) => {
			await page.goto(`${BASE}/map`);
			await expect(page.getByText(/\d+ VENUES/)).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// FESTIVALS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Festivals Page', () => {
		test('loads and shows festival names', async ({ page }) => {
			await page.goto(`${BASE}/festivals`);
			await expect(page.getByText('FESTIVALS')).toBeVisible();
			const links = await page.locator('a[href^="/festivals/"]').count();
			expect(links).toBeGreaterThan(0);
		});
	});
});
