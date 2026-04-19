import { browser } from '$app/environment';

// Simple geolocation state. We never persist the user's location — it's held in
// memory for the duration of the session and discarded on reload.
// Users can only enable "Within N miles" if the browser grants permission.

export type LocStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

let _status = $state<LocStatus>('idle');
let _coords = $state<{ lat: number; lng: number } | null>(null);
let _error = $state<string | null>(null);

async function request(): Promise<void> {
	if (!browser) return;
	if (!('geolocation' in navigator)) {
		_status = 'unsupported';
		_error = 'Geolocation not supported';
		return;
	}
	_status = 'requesting';
	_error = null;
	try {
		const position = await new Promise<GeolocationPosition>((resolve, reject) =>
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: false,
				timeout: 8000,
				maximumAge: 5 * 60 * 1000
			})
		);
		_status = 'granted';
		_coords = { lat: position.coords.latitude, lng: position.coords.longitude };
		_error = null;
	} catch (e) {
		_status = 'denied';
		_coords = null;
		_error = e instanceof Error ? e.message : String(e);
	}
}

function clear() {
	_status = 'idle';
	_coords = null;
	_error = null;
}

export const userLocation = {
	get status(): LocStatus { return _status; },
	get coords() { return _coords; },
	get error() { return _error; },
	request,
	clear
};
