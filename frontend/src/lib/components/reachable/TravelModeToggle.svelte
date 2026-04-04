<script lang="ts">
	import type { TravelMode } from '$lib/travel-time';

	let {
		value = 'transit' as TravelMode,
		onchange
	}: {
		value: TravelMode;
		onchange: (mode: TravelMode) => void;
	} = $props();

	const MODES: { mode: TravelMode; label: string; description: string }[] = [
		{ mode: 'transit', label: 'TRANSIT', description: 'Tube, bus, rail' },
		{ mode: 'walking', label: 'WALKING', description: 'On foot' },
		{ mode: 'bicycling', label: 'CYCLING', description: 'By bike' }
	];
</script>

<div class="travel-mode">
	<span class="label">TRAVEL MODE</span>

	<div class="modes">
		{#each MODES as { mode, label, description } (mode)}
			{@const isSelected = value === mode}
			<button
				class="mode-btn"
				class:mode-selected={isSelected}
				onclick={() => onchange(mode)}
				aria-pressed={isSelected}
			>
				<div class="mode-icon">
					{#if mode === 'transit'}
						<!-- Train icon -->
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="4" y="3" width="16" height="16" rx="0" />
							<path d="M4 11h16" />
							<path d="M12 3v8" />
							<circle cx="8" cy="15" r="1" fill="currentColor" />
							<circle cx="16" cy="15" r="1" fill="currentColor" />
							<path d="M8 19l-2 3" />
							<path d="M16 19l2 3" />
						</svg>
					{:else if mode === 'walking'}
						<!-- Walking icon -->
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="5" r="1.5" fill="currentColor" />
							<path d="M10 21l1.5-7.5L14 16v5" />
							<path d="M10 13.5l-2 3.5" />
							<path d="M14 8l-2.5 5.5" />
							<path d="M10 8.5l2-1" />
						</svg>
					{:else}
						<!-- Bike icon -->
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="5.5" cy="17.5" r="3.5" />
							<circle cx="18.5" cy="17.5" r="3.5" />
							<path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" />
							<path d="M12 17.5V14l-3-3 4-3 2 3h2" />
						</svg>
					{/if}
				</div>
				<span class="mode-label">{label}</span>
				<span class="mode-desc">{description}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.travel-mode {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
	}

	.modes {
		display: flex;
		gap: 0;
	}

	.mode-btn {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp),
			border-color var(--duration-fast) var(--ease-sharp);
	}

	.mode-btn + .mode-btn {
		margin-left: -1px;
	}

	.mode-btn:hover {
		color: var(--color-text);
		border-color: var(--color-text);
		z-index: 1;
	}

	.mode-selected {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
		z-index: 2;
	}

	.mode-selected:hover {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
	}

	.mode-icon {
		width: 1.25rem;
		height: 1.25rem;
	}

	.mode-icon svg {
		width: 100%;
		height: 100%;
	}

	.mode-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
	}

	.mode-desc {
		font-size: 0.625rem;
		color: var(--color-text-tertiary);
		display: none;
	}

	@media (min-width: 768px) {
		.mode-desc {
			display: block;
		}
	}

	.mode-selected .mode-desc {
		color: var(--color-screening-text);
		opacity: 0.7;
	}
</style>
