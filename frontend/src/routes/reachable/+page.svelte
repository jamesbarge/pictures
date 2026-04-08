<script lang="ts">
	import PostcodeInput from '$lib/components/reachable/PostcodeInput.svelte';
	import DeadlinePicker from '$lib/components/reachable/DeadlinePicker.svelte';
	import TravelModeToggle from '$lib/components/reachable/TravelModeToggle.svelte';
	import ReachableResults from '$lib/components/reachable/ReachableResults.svelte';
	import { reachableStore } from '$lib/stores/reachable.svelte';
	import { getReachableScreenings, type Screening } from '$lib/travel-time';

	let { data } = $props();

	type LoadedScreening = (typeof data.screenings)[number];

	// Map API screenings to the shape travel-time expects
	const mappedScreenings: Screening[] = $derived(
		data.screenings
			.filter((s: LoadedScreening) => s.film && s.cinema)
			.map((s: LoadedScreening) => ({
				id: s.id,
				datetime: s.datetime,
				format: s.format,
				bookingUrl: s.bookingUrl,
				cinema: {
					id: s.cinema.id,
					name: s.cinema.name,
					shortName: s.cinema.shortName
				},
				film: {
					id: s.film.id,
					title: s.film.title,
					year: s.film.year,
					runtime: s.film.runtime,
					posterUrl: s.film.posterUrl
				}
			}))
	);

	// Compute reachable screenings reactively
	const reachableScreenings = $derived.by(() => {
		if (
			!reachableStore.hasTravelTimes ||
			!reachableStore.finishedByTime
		) {
			return [];
		}
		return getReachableScreenings(
			mappedScreenings,
			reachableStore.travelTimes,
			reachableStore.finishedByTime
		);
	});

	// Can we calculate?
	const canCalculate = $derived(
		reachableStore.coordinates !== null &&
		reachableStore.finishedByTime !== null &&
		!reachableStore.isCalculating
	);

	// Show results section?
	const showResults = $derived(
		reachableStore.hasTravelTimes && reachableStore.finishedByTime !== null
	);

	function handlePostcodeChange(
		postcode: string,
		coords: { lat: number; lng: number } | null,
		error?: string
	) {
		reachableStore.postcode = postcode;
		reachableStore.coordinates = coords;
		if (error) {
			reachableStore.error = error;
		}
		// Clear travel times when location changes
		reachableStore.travelTimes = {};
	}

	function handleDeadlineChange(time: Date | null) {
		reachableStore.finishedByTime = time;
	}

	function handleTravelModeChange(mode: 'transit' | 'walking' | 'bicycling') {
		reachableStore.travelMode = mode;
		// Clear travel times when mode changes
		reachableStore.travelTimes = {};
	}

	async function handleCalculate() {
		if (!canCalculate) return;
		await reachableStore.calculateTravelTimes(data.cinemas);
	}
</script>

<svelte:head>
	<title>What Can I Catch? — pictures · london</title>
	<meta name="description" content="Find cinema screenings you can reach in time from your location across London." />
</svelte:head>

<section class="page">
	<div class="container">
		<!-- Header -->
		<div class="page-header">
			<h1 class="page-title">WHAT CAN I CATCH?</h1>
			<p class="page-subtitle">
				Enter your postcode, set a deadline, and we'll show you every screening you can reach in time.
			</p>
		</div>

		<!-- Controls -->
		<div class="controls">
			<PostcodeInput
				value={reachableStore.postcode}
				onchange={handlePostcodeChange}
			/>

			<DeadlinePicker
				value={reachableStore.finishedByTime}
				onchange={handleDeadlineChange}
			/>

			<TravelModeToggle
				value={reachableStore.travelMode}
				onchange={handleTravelModeChange}
			/>

			<!-- Calculate button -->
			<button
				class="calculate-btn"
				onclick={handleCalculate}
				disabled={!canCalculate}
			>
				{#if reachableStore.isCalculating}
					<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</svg>
					CALCULATING...
				{:else}
					FIND SCREENINGS
				{/if}
			</button>

			<!-- Error -->
			{#if reachableStore.error}
				<p class="error-msg">{reachableStore.error}</p>
			{/if}
		</div>

		<!-- Results -->
		{#if showResults && reachableStore.finishedByTime}
			<div class="results-section">
				<div class="results-divider"></div>
				<ReachableResults
					screenings={reachableScreenings}
					totalScreenings={mappedScreenings.length}
					finishedByTime={reachableStore.finishedByTime}
				/>
			</div>
		{/if}
	</div>
</section>

<style>
	.page {
		padding: 1.5rem 0 3rem;
	}

	.container {
		max-width: 700px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	@media (min-width: 768px) {
		.container {
			padding: 0 2rem;
		}
	}

	/* ── Header ── */
	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid var(--color-border);
	}

	.page-title {
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.page-subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	/* ── Controls ── */
	.controls {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* ── Calculate button ── */
	.calculate-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.875rem 1.5rem;
		font-size: var(--font-size-xs);
		font-weight: 700;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border: 1px solid var(--color-screening-bg);
		cursor: pointer;
		transition:
			opacity var(--duration-fast) var(--ease-sharp);
	}

	.calculate-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.calculate-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 767px) {
		.calculate-btn {
			padding: 1rem 1.5rem;
			font-size: var(--font-size-sm);
		}
	}

	.btn-spinner {
		width: 1rem;
		height: 1rem;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* ── Error ── */
	.error-msg {
		font-size: var(--font-size-xs);
		color: var(--color-accent);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* ── Results ── */
	.results-section {
		margin-top: 2rem;
	}

	.results-divider {
		height: 2px;
		background: var(--color-border);
		margin-bottom: 2rem;
	}
</style>
