import { browser } from '$app/environment';

/**
 * App-shell state shared by the sidebar, the top bar and the homepage.
 *
 * - `drawerOpen`: the sidebar drawer below 1024px.
 * - Collapsed: the persistent sidebar at 1024px and up, folded down to the
 *   top bar's burger. Lives only as an <html> attribute plus localStorage.
 * - `displayMode`: Posters or Text on the homepage (the View row lives in the
 *   sidebar, the listing in the page).
 * - `filmCount` / `programmeCounts`: published by the homepage so controls in
 *   the layout can show live counts. Null on every other page.
 */

export type DisplayMode = 'posters' | 'text';
export interface ProgrammeCounts { all: number; new: number; rep: number }

const COLLAPSED_KEY = 'pictures-sidebar-collapsed';

/** Width at which the sidebar stops being a drawer and sits beside the page. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** Attribute on <html> that hides the desktop sidebar. app.html sets it before
 * first paint from localStorage, so a collapsed sidebar never flashes open. */
const COLLAPSED_ATTR = 'data-sidebar-collapsed';

let drawerOpen = $state(false);
let desktop = $state(false);
let displayMode = $state<DisplayMode>('posters');
let filmCount = $state<number | null>(null);
let programmeCounts = $state<ProgrammeCounts | null>(null);

function setCollapsed(value: boolean) {
	if (!browser) return;
	document.documentElement.toggleAttribute(COLLAPSED_ATTR, value);
	try {
		localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
	} catch {
		// best-effort persistence
	}
}

if (browser) {
	const mq = window.matchMedia(DESKTOP_QUERY);
	mq.addEventListener('change', () => {
		desktop = mq.matches;
		// A drawer left open while widening the window would strand the scrim.
		if (desktop) drawerOpen = false;
	});

	// `desktop` feeds the drawer's dialog attributes, so apply it after
	// hydration (same two-RAF deferral as filters.svelte.ts); CSS media
	// queries carry the layout until then.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			desktop = mq.matches;
		});
	});
}

export const shell = {
	get drawerOpen() { return drawerOpen; },
	set drawerOpen(v: boolean) { drawerOpen = v; },

	/** True at 1024px and up (false during SSR). */
	get desktop() { return desktop; },

	/** The burger: expand the collapsed sidebar, or open the drawer. */
	openMenu() {
		if (desktop) setCollapsed(false);
		else drawerOpen = true;
	},

	/** The sidebar's own button: collapse it, or close the drawer. */
	closeMenu() {
		if (desktop) setCollapsed(true);
		else drawerOpen = false;
	},

	get displayMode() { return displayMode; },
	set displayMode(v: DisplayMode) { displayMode = v; },

	get filmCount() { return filmCount; },
	get programmeCounts() { return programmeCounts; },

	/** Homepage publishes its live counts; pass nulls on leave. */
	setCounts(films: number | null, programme: ProgrammeCounts | null) {
		filmCount = films;
		programmeCounts = programme;
	}
};
