import { browser } from '$app/environment';

const STORAGE_KEY = 'pictures-preferences';

type Theme = 'light' | 'dark' | 'system';
type ViewMode = 'poster' | 'text';

interface Preferences {
	theme: Theme;
	viewMode: ViewMode;
}

const DEFAULTS: Preferences = { theme: 'system', viewMode: 'poster' };

function loadPreferences(): Preferences {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		// Spread DEFAULTS first so any missing field in the persisted value falls
		// back without a separate else branch — `JSON.parse(null)` is impossible
		// because the `raw ?` guard short-circuits.
		return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
	} catch {
		return { ...DEFAULTS };
	}
}

const initial = loadPreferences();
let theme = $state<Theme>(initial.theme);
let viewMode = $state<ViewMode>(initial.viewMode);

if (browser) {
	$effect.root(() => {
		$effect(() => {
			const data: Preferences = { theme, viewMode };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		});

		$effect(() => {
			const root = document.documentElement;
			if (theme === 'system') {
				root.removeAttribute('data-theme');
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
			} else {
				root.setAttribute('data-theme', theme);
			}
		});
	});
}

export const preferences = {
	get theme() { return theme; },
	set theme(v: Theme) { theme = v; },

	get viewMode() { return viewMode; },
	set viewMode(v: ViewMode) { viewMode = v; }
};
