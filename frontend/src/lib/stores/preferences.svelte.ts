import { browser } from '$app/environment';

const STORAGE_KEY = 'pictures-preferences';

type Theme = 'light' | 'dark' | 'system';
type ViewMode = 'poster' | 'text';

interface Preferences {
	theme: Theme;
	viewMode: ViewMode;
}

function loadPreferences(): Preferences {
	if (!browser) return { theme: 'system', viewMode: 'poster' };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? { theme: 'system', viewMode: 'poster', ...JSON.parse(raw) } : { theme: 'system', viewMode: 'poster' };
	} catch {
		return { theme: 'system', viewMode: 'poster' };
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
