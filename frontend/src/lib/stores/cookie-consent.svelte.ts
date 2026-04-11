import { browser } from '$app/environment';

type ConsentStatus = 'pending' | 'accepted' | 'rejected';

const STORAGE_KEY = 'pictures-cookie-consent';

interface PersistedConsent {
	status: ConsentStatus;
	updatedAt: string;
}

function loadConsent(): ConsentStatus {
	if (!browser) return 'pending';
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return 'pending';
		const parsed: PersistedConsent = JSON.parse(raw);
		return parsed.status;
	} catch {
		return 'pending';
	}
}

let analyticsConsent = $state<ConsentStatus>(loadConsent());

if (browser) {
	$effect.root(() => {
		$effect(() => {
			if (analyticsConsent !== 'pending') {
				const data: PersistedConsent = {
					status: analyticsConsent,
					updatedAt: new Date().toISOString()
				};
				localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
			}
		});
	});
}

export const cookieConsent = {
	get status() { return analyticsConsent; },
	get canTrack() { return analyticsConsent === 'accepted'; },
	get hasDecided() { return analyticsConsent !== 'pending'; },

	accept() {
		analyticsConsent = 'accepted';
	},

	reject() {
		analyticsConsent = 'rejected';
	}
};
