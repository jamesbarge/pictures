<script lang="ts">
	import { browser } from '$app/environment';

	let { rating, filmId }: { rating: number; filmId: string } = $props();

	const LETTERBOXD_GREEN = '#00E054';
	const LETTERBOXD_ORANGE = '#FF8000';

	const storageKey = `letterboxd-revealed-${filmId}`;

	let isRevealed = $state(
		browser ? sessionStorage.getItem(storageKey) === 'true' : false
	);

	function reveal() {
		if (isRevealed) return;
		isRevealed = true;
		if (browser) {
			sessionStorage.setItem(storageKey, 'true');
		}
	}

	// Star calculation
	const fullStars = $derived(Math.floor(rating));
	const hasHalfStar = $derived(rating % 1 >= 0.25 && rating % 1 < 0.75);
	const roundedUp = $derived(rating % 1 >= 0.75);
	const displayStars = $derived(roundedUp ? fullStars + 1 : fullStars);
	const emptyStars = $derived(5 - displayStars - (hasHalfStar ? 1 : 0));
</script>

{#if isRevealed}
	<div class="rating-revealed">
		<div class="stars">
			{#each Array(displayStars) as _, i}
				<svg viewBox="0 0 24 24" class="star" fill={LETTERBOXD_ORANGE} stroke={LETTERBOXD_ORANGE} stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
				</svg>
			{/each}
			{#if hasHalfStar}
				<svg viewBox="0 0 24 24" class="star">
					<defs>
						<linearGradient id="half-{filmId}">
							<stop offset="50%" stop-color={LETTERBOXD_ORANGE} />
							<stop offset="50%" stop-color="transparent" />
						</linearGradient>
					</defs>
					<path fill="url(#half-{filmId})" stroke={LETTERBOXD_ORANGE} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
				</svg>
			{/if}
			{#each Array(Math.max(0, emptyStars)) as _, i}
				<svg viewBox="0 0 24 24" class="star" fill="transparent" stroke="#666" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
				</svg>
			{/each}
		</div>
		<span class="rating-value" style="color: {LETTERBOXD_GREEN}">{rating.toFixed(1)}</span>
	</div>
{:else}
	<button class="reveal-btn" onclick={reveal} aria-label="Show Letterboxd rating">
		<svg class="eye-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
			<circle cx="12" cy="12" r="3"/>
		</svg>
		<span>SHOW RATING</span>
	</button>
{/if}

<style>
	.rating-revealed {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface);
	}

	.stars {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.star {
		width: 14px;
		height: 14px;
	}

	.rating-value {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.reveal-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-sharp),
			border-color var(--duration-fast) var(--ease-sharp);
	}

	.reveal-btn:hover {
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.eye-icon {
		flex-shrink: 0;
	}
</style>
