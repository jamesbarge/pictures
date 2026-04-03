<script lang="ts">
	import { onMount } from 'svelte';
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

	const vignetteOpacity = $derived(dimmerValue * 0.5);

	function lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	function lerpColor(light: readonly [number, number, number], dark: readonly [number, number, number], t: number): string {
		return `rgb(${Math.round(lerp(light[0], dark[0], t))}, ${Math.round(lerp(light[1], dark[1], t))}, ${Math.round(lerp(light[2], dark[2], t))})`;
	}

	function warmLerp(light: readonly [number, number, number], dark: readonly [number, number, number], t: number, warmth: number = 0): string {
		const r = lerp(light[0], dark[0], t);
		const g = lerp(light[1], dark[1], t);
		const b = lerp(light[2], dark[2], t);
		const w = Math.sin(t * Math.PI) * warmth;
		return `rgb(${Math.round(Math.min(255, r + w * 50))}, ${Math.round(Math.min(255, g + w * 15))}, ${Math.round(Math.max(0, b - w * 55))})`;
	}

	const L = {
		bg: [245, 242, 235], bgSubtle: [236, 232, 223], surface: [255, 255, 255],
		text: [10, 10, 10], textSecondary: [58, 58, 58], textTertiary: [106, 106, 106],
		border: [10, 10, 10], borderSubtle: [208, 204, 196], accent: [230, 57, 70],
		screenBg: [10, 10, 10], screenText: [245, 242, 235],
	} as const;

	const D = {
		bg: [14, 12, 10], bgSubtle: [24, 21, 18], surface: [30, 27, 24],
		text: [240, 235, 220], textSecondary: [185, 175, 160], textTertiary: [115, 108, 98],
		border: [240, 235, 220], borderSubtle: [50, 44, 38], accent: [255, 85, 70],
		screenBg: [240, 235, 220], screenText: [14, 12, 10],
	} as const;

	function applyTheme(t: number) {
		if (!browser) return;
		const root = document.documentElement;
		root.style.setProperty('--color-bg', warmLerp(L.bg, D.bg, t, 1.2));
		root.style.setProperty('--color-bg-subtle', warmLerp(L.bgSubtle, D.bgSubtle, t, 1.0));
		root.style.setProperty('--color-surface', warmLerp(L.surface, D.surface, t, 0.8));
		root.style.setProperty('--color-text', lerpColor(L.text, D.text, t));
		root.style.setProperty('--color-text-secondary', lerpColor(L.textSecondary, D.textSecondary, t));
		root.style.setProperty('--color-text-tertiary', lerpColor(L.textTertiary, D.textTertiary, t));
		root.style.setProperty('--color-border', lerpColor(L.border, D.border, t));
		root.style.setProperty('--color-border-subtle', lerpColor(L.borderSubtle, D.borderSubtle, t));
		root.style.setProperty('--color-accent', lerpColor(L.accent, D.accent, t));
		root.style.setProperty('--color-screening-bg', lerpColor(L.screenBg, D.screenBg, t));
		root.style.setProperty('--color-screening-text', lerpColor(L.screenText, D.screenText, t));
		localStorage.setItem(STORAGE_KEY, String(t));
	}

	function setDimmer(v: number) {
		dimmerValue = v;
		applyTheme(v);
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

	onMount(() => {
		applyTheme(dimmerValue);
	});
</script>

<!-- Vignette overlay -->
{#if dimmerValue > 0.02}
	<div class="vignette" style="opacity: {vignetteOpacity};"></div>
{/if}

<!-- Inline horizontal fader — lives in the header -->
<div class="house-lights" class:dragging={isDragging}>
	<span class="hl-label">HOUSE LIGHTS</span>

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
		inset: 0;
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
		user-select: none;
		touch-action: none;
	}

	.hl-label {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
		white-space: nowrap;
		font-family: var(--font-mono);
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
