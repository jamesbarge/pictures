import { test, expect, type Locator, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Open a toolbar Dropdown (WHERE / FORMAT / the WHEN custom-date control) and
// wait for its `role="group"` panel to appear. The Dropdown registers a
// capture-phase document click-listener the moment it opens, so under the
// mobile-small project's touch emulation the very tap that opened the panel can
// be re-read as an outside-click and close it again. Re-tapping via toPass()
// absorbs that race without weakening the assertion — the panel MUST end up
// open. Desktop chromium opens first try and skips the retry.
async function openToolbarPanel(page: Page, trigger: Locator, panelName: string) {
	const panel = page.getByRole('group', { name: panelName });
	await expect(async () => {
		if (!(await panel.isVisible())) await trigger.click();
		await expect(panel).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 8000 });
	return panel;
}

// This spec covers desktop-first UX — force a desktop viewport so the desktop
// shell (the FigmaToolbar filter bar, poster card grid, split header masthead)
// is the one being asserted regardless of which project runs the file (e.g.
// the mobile-small device project).
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
	// HOMEPAGE (Spline redesign — FigmaToolbar + poster cards)
	// ═══════════════════════════════════════════════

	test.describe('Homepage', () => {
		test('loads and shows film cards with real data', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const cards = await page.locator('article.card').count();
			expect(cards).toBeGreaterThan(0);
			const firstTitle = await page.locator('article.card h3.title').first().textContent();
			expect(firstTitle).toBeTruthy();
			expect(firstTitle!.length).toBeGreaterThan(0);
		});

		test('shows day header band with weekday + ordinal', async ({ page }) => {
			await page.goto(BASE);
			// Redesign: each `<section class="day">` carries a dark `.day-header`
			// band whose <h2> reads "TODAY" for the first group or
			// "WEEKDAY THE ORDINAL OF MONTH" for subsequent ones. The first group
			// is always today, so assert the band exists and reads TODAY (or, if
			// the data ever lacks a today group, a weekday string).
			const heading = page.locator('section.day .day-header h2').first();
			await expect(heading).toBeVisible();
			const text = (await heading.textContent())?.toLowerCase() ?? '';
			expect(text).toMatch(/today|monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
		});

		test('shows date-range tablist with Today tab', async ({ page }) => {
			await page.goto(BASE);
			// The day-strip date controls were replaced by the toolbar's
			// "Date range" tablist (TODAY / TOMORROW / THIS WEEK).
			const tablist = page.locator('[role="tablist"][aria-label="Date range"]');
			await expect(tablist.getByRole('tab', { name: 'TODAY', exact: true })).toBeVisible();
		});

		test('listings default to a rolling multi-day window from today onwards', async ({ page }) => {
			// Contract since the multi-day rolling-calendar change: the homepage
			// shows today + the next few days (until ~24 films are visible), each
			// in its own `<section class="day">` with a day-header band. The
			// lock-in invariant is that NO visible screening can resolve to a
			// London date < today — a leaked past screening or a UTC-vs-London
			// comparison bug would produce a `datetime` that resolves to a London
			// date strictly before today. In the redesign each screening is a
			// `<time class="screening-time" datetime>` inside the poster card.
			const londonDate = (iso: string) =>
				new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
			const today = londonDate(new Date().toISOString());

			await page.goto(BASE);
			await page.waitForSelector('section.day .screening-time', { timeout: 10000 });

			const collectDates = async () => {
				const times = page.locator('section.day .screening-time');
				const n = await times.count();
				const out: string[] = [];
				for (let i = 0; i < n; i++) {
					const dt = await times.nth(i).getAttribute('datetime');
					if (dt) out.push(dt);
				}
				return out;
			};

			const initial = await collectDates();
			expect(initial.length, 'expected at least one screening on the homepage').toBeGreaterThan(0);
			const beforeToday = initial.filter((d) => londonDate(d) < today);
			expect(
				beforeToday,
				`expected no screening before ${today} (London); ${beforeToday.length} leaked: ${beforeToday.slice(0, 3).join(', ')}`
			).toEqual([]);

			// Click the toolbar's TOMORROW date-range tab — the rolling window now
			// anchors to tomorrow only. Every visible screening must resolve to a
			// London date > today (no past leakage).
			await page
				.locator('[role="tablist"][aria-label="Date range"]')
				.getByRole('tab', { name: 'TOMORROW', exact: true })
				.click();
			await page.waitForTimeout(400);
			const after = await collectDates();
			if (after.length > 0) {
				const dates = after.map(londonDate);
				const earliest = [...dates].sort()[0];
				expect(
					earliest > today,
					`after selecting the TOMORROW tab, earliest visible date should be > today (${today}), got ${earliest}`
				).toBe(true);
			}
		});

		test('custom-date control opens the calendar popover', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			// The day-strip "Pick date" button was replaced by the toolbar's
			// custom-date control: a calendar-icon tab in the "Date range" group
			// that opens a "Pick date" panel, from which OPEN CALENDAR reveals the
			// month grid.
			await openToolbarPanel(
				page,
				page.getByRole('button', { name: 'Pick a custom date' }),
				'Pick date'
			);
			await page.getByRole('button', { name: 'OPEN CALENDAR' }).click();
			await expect(page.locator('.cal-grid')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
		});

		test('clicking the wordmark logo navigates home', async ({ page }) => {
			// The BreathingGrid wordmark is gone from the homepage; the masthead
			// logo is now the home affordance. Verify it carries the home a11y
			// label and routes home from another page.
			await page.goto(`${BASE}/about`);
			const home = page.locator('[aria-label="pictures london — home"]');
			await expect(home).toBeVisible();
			await home.click();
			await expect(page).toHaveURL(BASE + '/');
		});

		test('toolbar exposes the filter controls', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			// The homepage filter sidebar was replaced by the FigmaToolbar. Assert
			// its accessible shape: the search input, the WHERE / FORMAT chip
			// panels, and the date/film-type/display tablists.
			const toolbar = page.getByRole('toolbar', { name: 'Film filters' });
			await expect(toolbar).toBeVisible();
			await expect(
				toolbar.getByRole('searchbox', { name: 'Search films, directors, cast' })
			).toBeVisible();
			await expect(page.locator('[role="tablist"][aria-label="Date range"]')).toBeVisible();
			await expect(page.locator('[role="tablist"][aria-label="Film type"]')).toBeVisible();
			await expect(page.locator('[role="tablist"][aria-label="Display mode"]')).toBeVisible();
			await expect(toolbar.locator('button.chip', { hasText: 'WHERE' })).toBeVisible();
			await expect(toolbar.locator('button.chip', { hasText: 'FORMAT' })).toBeVisible();
		});

		test('ALL / NEW / REP film-type tabs visible', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			const tablist = page.locator('[role="tablist"][aria-label="Film type"]');
			await expect(tablist.getByRole('tab', { name: 'ALL', exact: true })).toBeVisible();
			await expect(tablist.getByRole('tab', { name: 'NEW', exact: true })).toBeVisible();
			await expect(tablist.getByRole('tab', { name: 'REP', exact: true })).toBeVisible();
		});

		test('REP tab filters to repertory-only films', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });

			const filmType = page.locator('[role="tablist"][aria-label="Film type"]');
			const titles = () => page.locator('article.card h3.title').allTextContents();

			// NOTE: a raw count comparison (rep <= all) no longer holds. The
			// homepage shows a rolling window capped by MIN_FILMS_VISIBLE /
			// MAX_DAYS_VISIBLE, so a filtered view that spreads thinner across
			// days can surface MORE total cards than the unfiltered cap admits.
			// The windowing-independent invariant is that REP and NEW partition
			// the catalogue: a repertory film is never a new release, so the two
			// filtered title sets must be disjoint.
			await filmType.getByRole('tab', { name: 'REP', exact: true }).click();
			await expect(filmType.locator('[role="tab"][aria-selected="true"]')).toHaveText('REP');
			await page.waitForTimeout(500);
			const repTitles = await titles();
			expect(repTitles.length).toBeGreaterThan(0);

			await filmType.getByRole('tab', { name: 'NEW', exact: true }).click();
			await expect(filmType.locator('[role="tab"][aria-selected="true"]')).toHaveText('NEW');
			await page.waitForTimeout(500);
			const newTitles = new Set(await titles());

			const overlap = repTitles.filter((t) => newTitles.has(t));
			expect(
				overlap,
				`expected REP and NEW film sets to be disjoint; overlap: ${overlap.slice(0, 3).join(', ')}`
			).toEqual([]);
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
					Array.from(document.querySelectorAll('article.card')).slice(0, 5).map((c) => ({
						title: c.querySelector('h3.title')?.textContent?.trim() ?? '',
						imgSrc: (c.querySelector('img') as HTMLImageElement | null)?.src ?? ''
					}))
				);

			const filmType = page.locator('[role="tablist"][aria-label="Film type"]');

			// Capture title→poster pairs from clicking the NEW tab on a fresh page.
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await filmType.getByRole('tab', { name: 'NEW', exact: true }).click();
			await expect(filmType.locator('[role="tab"][aria-selected="true"]')).toHaveText('NEW');
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
			await page.waitForSelector('article.card', { timeout: 10000 });
			await expect(filmType.locator('[role="tab"][aria-selected="true"]')).toHaveText('NEW');
			// Poll for the deferred persisted-state apply to settle.
			await expect.poll(readPairs, { timeout: 5000 }).toEqual(expected);
		});

		test('WHERE cinema filter narrows results', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const allCount = await page.locator('article.card').count();
			// The Soho/West End area-cluster chip lived in the old sidebar; the
			// redesign moves location filtering into the toolbar's WHERE chip,
			// which opens a panel of per-cinema checkboxes grouped by area.
			const wherePanel = await openToolbarPanel(
				page,
				page.locator('button.chip', { hasText: 'WHERE' }),
				'Where'
			);
			await wherePanel.locator('.checkbox-row').first().click();
			await page.waitForTimeout(500);
			const filteredCount = await page.locator('article.card').count();
			// Skip the assertion when the data can't actually exhibit narrowing —
			// the chosen cinema has no visible films (filteredCount=0) or every
			// visible film already plays there (filteredCount=allCount). Both
			// legitimately occur at sparse-data hours and aren't a filter bug.
			test.skip(
				filteredCount === 0 || filteredCount === allCount,
				`cannot test narrowing: filtered ${filteredCount} of ${allCount} after selecting a cinema`
			);
			expect(filteredCount).toBeLessThan(allCount);
			expect(filteredCount).toBeGreaterThan(0);
		});

		test('FORMAT filter (35mm) reduces displayed films', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			// Skip when no 35mm films are currently visible — the filter can't
			// narrow what isn't there. The poster card's format rail exposes the
			// format as "35MM" (uppercase).
			const hasAny35mm =
				(await page.locator('article.card').filter({ hasText: '35MM' }).count()) > 0;
			test.skip(!hasAny35mm, 'no 35mm films currently visible on homepage');
			const allCount = await page.locator('article.card').count();
			await page.locator('button.chip', { hasText: 'FORMAT' }).click();
			await page.getByRole('group', { name: 'Format' }).getByRole('checkbox', { name: '35MM' }).click();
			await page.waitForTimeout(500);
			const filteredCount = await page.locator('article.card').count();
			expect(filteredCount).toBeLessThan(allCount);
		});

		test('search matches film titles', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const allCount = await page.locator('article.card').count();
			await page.getByRole('searchbox', { name: 'Search films, directors, cast' }).fill('the');
			await page.waitForTimeout(400);
			const filteredCount = await page.locator('article.card').count();
			expect(filteredCount).toBeLessThanOrEqual(allCount);
		});

		test('search matches cinema names', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			// Skip when today has no Prince Charles films at all — the test
			// asserts that search FINDS them, not that PCC always has films
			// today. Late evening / quiet days legitimately have zero PCC
			// screenings remaining.
			const baselinePcc = await page
				.locator('article.card')
				.filter({ hasText: /Prince Charles/i })
				.count();
			test.skip(baselinePcc === 0, 'no Prince Charles films on homepage right now');
			await page.getByRole('searchbox', { name: 'Search films, directors, cast' }).fill('Prince Charles');
			await page.waitForTimeout(400);
			// Every visible card should have at least one Prince Charles screening
			const count = await page.locator('article.card').count();
			expect(count).toBeGreaterThan(0);
			const visibleText = await page.locator('.page-chrome').textContent();
			expect(visibleText?.toLowerCase()).toContain('prince charles');
		});

		test('display-mode toggle switches between posters and text', async ({ page }) => {
			// Replaces the old sidebar collapse/persist test. The homepage filter
			// sidebar no longer exists; the toolbar's "Display mode" tablist now
			// owns the POSTERS/TEXT view switch. POSTERS renders poster cards,
			// TEXT renders the screenings table.
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const displayMode = page.locator('[role="tablist"][aria-label="Display mode"]');
			await displayMode.getByRole('tab', { name: 'TEXT', exact: true }).click();
			await expect(page.getByRole('table', { name: 'Screenings list' }).first()).toBeVisible();
			await expect(page.locator('article.card')).toHaveCount(0);
			await displayMode.getByRole('tab', { name: 'POSTERS', exact: true }).click();
			await expect(page.locator('article.card').first()).toBeVisible();
		});

		test('House lights dimmer label is visible', async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(BASE);
			await expect(page.getByText('house lights')).toBeVisible();
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
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			const title = await page.locator('h1.film-title').textContent();
			expect(title).toBeTruthy();
			expect(title!.length).toBeGreaterThan(0);
		});

		test('shows metadata line (runtime · country · rating · genres)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			// New literary hero renders `.meta` inside `.info-col`
			await expect(page.locator('.info-col .meta').first()).toBeVisible();
		});

		test('shows Showings heading', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByRole('heading', { name: /howings/ }).first()).toBeVisible();
		});

		test('shows Want to see / Not interested status buttons', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByText('Want to see')).toBeVisible();
			await expect(page.getByText('Not interested')).toBeVisible();
			// "Seen" toggle should NOT be present
			const seenButtons = await page.getByText(/^SEEN$/).count();
			expect(seenButtons).toBe(0);
		});

		test('shows external links (at least one of TMDB / IMDb / Letterboxd)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			const extLinks = await page.locator('.ext').count();
			expect(extLinks).toBeGreaterThan(0);
		});

		test('has correct page title with film name', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page).toHaveTitle(/— pictures · london/);
		});

		test('shows bookable screening rows in the Showings section', async ({ page }) => {
			// The redesign removed the per-screening iCal download button
			// (`/api/calendar?screening=`). The Showings section now exposes each
			// screening as a `.screening-link` row that deep-links to the cinema's
			// own booking page — the new per-screening actionable affordance.
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			const rows = page.locator('.screening-link');
			await expect(rows.first()).toBeVisible();
			expect(await rows.count()).toBeGreaterThan(0);
			const href = await rows.first().getAttribute('href');
			expect(href).toBeTruthy();
			expect(href).toMatch(/^https?:\/\//);
		});

		test('Pick date button on detail opens calendar popover', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
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
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
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
