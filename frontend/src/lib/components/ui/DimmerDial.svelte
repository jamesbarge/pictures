<script lang="ts">
	import { browser } from '$app/environment';

	const STORAGE_KEY = 'pictures-dimmer';

	function loadDimmer(): number {
		if (!browser) return 0;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? parseFloat(raw) : 0;
		} catch {
			return 0;
		}
	}

	let dimmerValue = $state(loadDimmer());
	let isDragging = $state(false);
	let trackEl = $state<HTMLDivElement>();

	const vignetteOpacity = $derived(dimmerValue * 0.9);

	function lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	function lerpColor(light: readonly [number, number, number], dark: readonly [number, number, number], t: number): string {
		return `rgb(${Math.round(lerp(light[0], dark[0], t))}, ${Math.round(lerp(light[1], dark[1], t))}, ${Math.round(lerp(light[2], dark[2], t))})`;
	}

	// Light values mirror the app.css Spline tokens (--color-bg #efe9dc etc.).
	// The pre-paint boot script in app.html duplicates this table — keep the
	// two in sync when tokens change.
	const L = {
		'--color-bg': [239, 233, 220], '--color-bg-subtle': [229, 223, 208], '--color-surface': [255, 255, 255],
		'--color-text': [31, 31, 31], '--color-text-secondary': [42, 42, 42], '--color-text-tertiary': [90, 90, 90],
		'--color-border': [31, 31, 31], '--color-border-subtle': [202, 197, 186], '--color-accent': [31, 31, 31],
		'--color-screening-bg': [31, 31, 31], '--color-screening-text': [234, 229, 194],
	} as const;

	const D: Record<keyof typeof L, readonly [number, number, number]> = {
		'--color-bg': [14, 12, 10], '--color-bg-subtle': [24, 21, 18], '--color-surface': [30, 27, 24],
		'--color-text': [240, 235, 220], '--color-text-secondary': [185, 175, 160], '--color-text-tertiary': [115, 108, 98],
		'--color-border': [240, 235, 220], '--color-border-subtle': [50, 44, 38], '--color-accent': [240, 235, 220],
		'--color-screening-bg': [240, 235, 220], '--color-screening-text': [14, 12, 10],
	};

	const THEME_PROPS = Object.keys(L) as Array<keyof typeof L>;

	function applyTheme(t: number) {
		if (!browser) return;
		// Persist first — saving must not depend on <main> being ready, and
		// must not throw in Safari private mode (setItem raises there).
		try {
			localStorage.setItem(STORAGE_KEY, String(t));
		} catch {
			// best-effort persistence
		}
		// Target <main> rather than the document root so only content below the
		// header/menu is dimmed. The header keeps light-mode colors regardless
		// of dimmer position.
		const target = document.querySelector('main') as HTMLElement | null;
		if (!target) {
			console.warn('[dimmer] no <main> to apply house-lights theme to; value persisted only');
			return;
		}
		// The boot stylesheet (app.html) covered first paint; inline styles
		// below take over from here.
		document.getElementById('dimmer-boot-style')?.remove();
		if (t < 0.01) {
			// At rest the app.css tokens are the single source of truth —
			// remove the overrides rather than writing approximations of them.
			for (const prop of THEME_PROPS) target.style.removeProperty(prop);
			return;
		}
		// No warmth bias — dim is purely a darkening lerp, no amber cast.
		for (const prop of THEME_PROPS) target.style.setProperty(prop, lerpColor(L[prop], D[prop], t));
	}

	// Reactive — `applyTheme` runs on mount (initial value) and on every
	// `dimmerValue` change. Previously the imperative `setDimmer` call site
	// was the only path that re-applied the theme, so a programmatic state
	// update (testing, future feature flag, another component) wouldn't
	// propagate to the CSS custom properties.
	$effect(() => {
		applyTheme(dimmerValue);
	});

	function setDimmer(v: number) {
		dimmerValue = v;
	}

	function handlePointerDown(e: PointerEvent) {
		if (!trackEl) return;
		isDragging = true;
		trackEl.setPointerCapture(e.pointerId);
		updateFromPointer(e);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || !trackEl) return;
		updateFromPointer(e);
	}

	function updateFromPointer(e: PointerEvent) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const value = Math.max(0, Math.min(1, x / rect.width));
		setDimmer(value);
	}

	function handlePointerUp(e: PointerEvent) {
		isDragging = false;
		trackEl?.releasePointerCapture(e.pointerId);
	}
</script>

<!-- Vignette overlay -->
{#if dimmerValue > 0.02}
	<div class="vignette" style="opacity: {vignetteOpacity};"></div>
{/if}

<!-- Inline horizontal fader — mounted by the homepage's fixed .dimmer-anchor -->
<div class="house-lights" class:dragging={isDragging}>
	<span class="hl-label">house lights</span>

	<div
		bind:this={trackEl}
		class="hl-track"
		role="slider"
		aria-label="House lights dimmer"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(dimmerValue * 100)}
		tabindex="0"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onkeydown={(e) => {
			if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
				e.preventDefault();
				setDimmer(Math.min(1, dimmerValue + 0.05));
			} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
				e.preventDefault();
				setDimmer(Math.max(0, dimmerValue - 0.05));
			}
		}}
	>
		<div class="hl-fill" style="width: {dimmerValue * 100}%;"></div>
		<div class="hl-knob" style="left: {dimmerValue * 100}%;"></div>
	</div>
</div>

<style>
	.vignette {
		position: fixed;
		top: var(--header-height, 0);
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 45;
		pointer-events: none;
		background: radial-gradient(
			ellipse 70% 60% at 50% 50%,
			transparent 0%,
			rgba(10, 8, 5, 0.12) 50%,
			rgba(10, 8, 5, 0.45) 80%,
			rgba(10, 8, 5, 0.7) 100%
		);
		transition: opacity 0.3s ease;
	}

	.house-lights {
		display: none;
		align-items: center;
		gap: 0.5rem;
		user-select: none;
		touch-action: none;
	}

	@media (min-width: 768px) {
		.house-lights {
			display: flex;
		}
	}

	.hl-label {
		font-family: var(--font-serif);
		font-size: 13px;
		font-weight: 400;
		letter-spacing: -0.005em;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.hl-track {
		position: relative;
		width: 100px;
		height: 20px;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-bg-subtle);
		cursor: pointer;
		outline: none;
	}

	.hl-track:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.hl-fill {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		background: var(--color-text-tertiary);
		opacity: 0.2;
		pointer-events: none;
	}

	.hl-knob {
		position: absolute;
		top: -1px;
		bottom: -1px;
		width: 12px;
		transform: translateX(-50%);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		cursor: grab;
	}

	.dragging .hl-knob {
		cursor: grabbing;
		border-color: var(--color-accent);
	}

	.hl-knob::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 4px;
		height: 1px;
		background: var(--color-border);
	}
</style>
