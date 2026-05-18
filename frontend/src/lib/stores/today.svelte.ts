import { browser } from '$app/environment';
import { toLondonDateStr } from '$lib/utils';

// Shared "today (London)" value that ticks at the next London midnight.
//
// Why a store instead of `toLondonDateStr(new Date())` inline:
// - `$derived.by` only re-runs on tracked-state changes; a user who leaves
//   the homepage open across midnight would otherwise keep seeing yesterday's
//   listings until they interact with a filter.
// - Multiple consumers (DayMasthead `activeDate`, homepage `filmMap` default,
//   `dayGroups` bucketing) need to advance together — one shared source of
//   truth prevents the masthead from claiming "Sunday" while the grid still
//   shows Saturday's screenings for one render tick.

let todayValue = $state(toLondonDateStr(new Date()));

/**
 * ms until the next 00:00:00 London civil time, computed via Intl on the
 * current instant. Naturally handles BST/GMT transitions because the wall
 * clock the user sees is what we measure against — at the spring transition
 * the day is 23h long and we get 23h of `dayMs - elapsedMs`; at the autumn
 * transition the day is 25h long and the timer fires for ~25h.
 *
 * 1-second buffer so `toLondonDateStr` has actually rolled over by the time
 * the callback runs (Intl is millisecond-accurate but JS timers aren't).
 */
function msUntilNextLondonMidnight(): number {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/London',
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date());
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
	const elapsedMs = get('hour') * 3_600_000 + get('minute') * 60_000 + get('second') * 1000;
	const dayMs = 24 * 3_600_000;
	return dayMs - elapsedMs + 1000;
}

// HMR can re-evaluate this module, which would stack a fresh `visibilitychange`
// listener and a fresh midnight-tick timer on top of the previous boot. The
// listener is never removed at runtime (the store lives for the full document
// lifetime), so the simplest fix is a global de-dupe key — module-level
// `let _bootstrapped` would itself reset on HMR.
const BOOTSTRAP_KEY = '__picturesTodayStoreBootstrapped';
type WindowWithBootstrap = Window & { [BOOTSTRAP_KEY]?: boolean };

if (browser && !(window as WindowWithBootstrap)[BOOTSTRAP_KEY]) {
	(window as WindowWithBootstrap)[BOOTSTRAP_KEY] = true;

	const tick = () => {
		todayValue = toLondonDateStr(new Date());
		setTimeout(tick, msUntilNextLondonMidnight());
	};
	setTimeout(tick, msUntilNextLondonMidnight());

	// Also re-evaluate when the tab returns from background — a sleeping
	// laptop or a tab that was hidden across the midnight boundary won't
	// have fired its setTimeout reliably (browsers throttle background tabs).
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			const fresh = toLondonDateStr(new Date());
			if (fresh !== todayValue) todayValue = fresh;
		}
	});
}

export const today = {
	get value() {
		return todayValue;
	}
};
