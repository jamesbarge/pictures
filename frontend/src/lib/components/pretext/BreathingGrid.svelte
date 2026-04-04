<script lang="ts">
	import { onMount } from 'svelte';

	const BRAND_FULL = 'pictures·london';

	const BREATHE_AMPLITUDE = 0.12;
	const BREATHE_PERIOD = 3200;
	const HOVER_RADIUS = 160;
	const HOVER_SCALE_EXTRA = 0.35;
	const CELL_SIZE = 18;

	interface CharCell {
		char: string;
		col: number;
		phase: number;
		isSeparator: boolean;
	}

	const chars: CharCell[] = [];
	for (let i = 0; i < BRAND_FULL.length; i++) {
		chars.push({
			char: BRAND_FULL[i],
			col: i,
			phase: i * 0.3,
			isSeparator: BRAND_FULL[i] === '·'
		});
	}

	let containerEl: HTMLDivElement;
	let mouseX = $state(-1000);
	let mouseY = $state(-1000);
	let animTime = $state(0);
	let animFrame: number;
	let mounted = $state(false);

	function getCharScale(cell: CharCell, time: number, mx: number, my: number): number {
		const breathe = Math.sin((time / BREATHE_PERIOD) * Math.PI * 2 + cell.phase) * BREATHE_AMPLITUDE;
		let scale = 1.0 + breathe;

		if (mx > -500 && containerEl) {
			const rect = containerEl.getBoundingClientRect();
			const cx = rect.left + cell.col * CELL_SIZE + CELL_SIZE / 2;
			const cy = rect.top + rect.height / 2;
			const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

			if (dist < HOVER_RADIUS) {
				const proximity = 1 - dist / HOVER_RADIUS;
				const eased = proximity * proximity * proximity;
				scale += HOVER_SCALE_EXTRA * eased;
			}
		}

		return scale;
	}

	function animate(timestamp: number) {
		animTime = timestamp;
		animFrame = requestAnimationFrame(animate);
	}

	function handleMouseMove(e: MouseEvent) {
		mouseX = e.clientX;
		mouseY = e.clientY;
	}

	function handleMouseLeave() {
		mouseX = -1000;
		mouseY = -1000;
	}

	onMount(() => {
		mounted = true;

		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!prefersReducedMotion) {
			animFrame = requestAnimationFrame(animate);
		}

		function handleVisibility() {
			if (prefersReducedMotion) return;
			if (document.hidden) {
				cancelAnimationFrame(animFrame);
			} else {
				animFrame = requestAnimationFrame(animate);
			}
		}
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			cancelAnimationFrame(animFrame);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<div
	bind:this={containerEl}
	class="breathing-grid select-none"
	role="img"
	aria-label="pictures london"
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
>
	{#if mounted}
		{#each chars as cell}
			{@const scale = getCharScale(cell, animTime, mouseX, mouseY)}
			<span class="grid-cell" class:separator={cell.isSeparator}>
				<span class="grid-char font-display" style="transform: scale({scale});">
					{cell.char}
				</span>
			</span>
		{/each}
	{:else}
		<span class="font-display text-base tracking-swiss">pictures · london</span>
	{/if}
</div>

<style>
	.breathing-grid {
		display: inline-flex;
		align-items: center;
		cursor: default;
		margin-left: -3px;
		height: 24px;
	}

	.grid-cell {
		width: 18px;
		height: 24px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		overflow: visible;
	}

	.grid-cell.separator {
		width: 14px;
	}

	.grid-char {
		font-size: 16px;
		font-weight: 500;
		text-transform: lowercase;
		line-height: 1;
		will-change: transform;
	}
</style>
