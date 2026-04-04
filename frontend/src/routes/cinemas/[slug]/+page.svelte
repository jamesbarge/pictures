<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatTime, formatScreeningDate, toLondonDateStr, groupBy } from '$lib/utils';

	let { data } = $props();

	const cinema = $derived(data.cinema);
	const screenings = $derived(data.screenings);

	const futureScreenings = $derived(
		screenings
			.filter((s) => new Date(s.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const groupedByDate = $derived.by(() => {
		const grouped = groupBy(futureScreenings, (s) => toLondonDateStr(s.datetime));
		return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
	});
</script>

<svelte:head>
	<title>{cinema.name} — pictures · london</title>
	<meta name="description" content="Screenings at {cinema.name}, London" />
</svelte:head>

<div class="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
	<!-- Cinema header -->
	<div class="cinema-header">
		<h1 class="cinema-name font-display">{cinema.name}</h1>

		{#if cinema.address}
			<p class="cinema-address">
				{cinema.address.street}, {cinema.address.area}, {cinema.address.postcode}
			</p>
		{/if}

		<div class="cinema-meta">
			{#if cinema.website}
				<a href={cinema.website} target="_blank" rel="noopener noreferrer" class="cinema-website">
					WEBSITE
					<svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" class="inline ml-0.5">
						<path d="M2 10L10 2M10 2H4M10 2V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
					</svg>
					<span class="sr-only">(opens in new tab)</span>
				</a>
			{/if}
			{#if cinema.screens}
				<span class="screen-count">{cinema.screens} SCREENS</span>
			{/if}
		</div>

		{#if cinema.features?.length}
			<div class="features">
				{#each cinema.features as feature}
					<Badge variant="muted">{feature.replace(/_/g, ' ')}</Badge>
				{/each}
			</div>
		{/if}

		{#if cinema.description}
			<p class="cinema-description">{cinema.description}</p>
		{/if}
	</div>

	<!-- Screenings -->
	{#if futureScreenings.length > 0}
		<section class="screenings-section" aria-labelledby="screenings-heading">
			<h2 id="screenings-heading" class="section-heading font-display">
				SCREENINGS
				<span class="screening-count">{futureScreenings.length}</span>
			</h2>

			{#each groupedByDate as [date, dayScreenings] (date)}
				<div class="day-group">
					<h3 class="day-label">{formatScreeningDate(date)}</h3>
					<div class="screening-rows">
						{#each dayScreenings as screening (screening.id)}
							<div class="screening-row">
								<time class="screening-time" datetime={screening.datetime}>{formatTime(screening.datetime)}</time>
								<a href="/film/{screening.film.id}" class="screening-film">
									{screening.film.title}
								</a>
								{#if screening.film.year}
									<span class="screening-year">{screening.film.year}</span>
								{/if}
								{#if screening.format && screening.format !== 'unknown' && screening.format !== 'dcp'}
									<Badge variant="muted">{screening.format.toUpperCase()}</Badge>
								{/if}
								<a
									href={screening.bookingUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="booking-link"
									aria-label="Book {screening.film.title} at {formatTime(screening.datetime)}"
								>
									<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
										<path d="M2 10L10 2M10 2H4M10 2V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
									</svg>
								</a>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</section>
	{/if}
</div>

<style>
	.cinema-header {
		margin-bottom: 2rem;
	}

	.cinema-name {
		font-size: var(--font-size-3xl);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.cinema-address {
		margin-top: 0.5rem;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.cinema-meta {
		display: flex;
		gap: 1.5rem;
		margin-top: 0.75rem;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.cinema-website {
		color: var(--color-text-tertiary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.cinema-website:hover {
		color: var(--color-text);
	}

	.screen-count {
		color: var(--color-text-tertiary);
		font-family: var(--font-mono);
	}

	.features {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.75rem;
	}

	.cinema-description {
		margin-top: 1rem;
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
		max-width: 40rem;
	}

	.screenings-section {
		border-top: 2px solid var(--color-border);
		padding-top: 1.5rem;
	}

	.section-heading {
		font-size: var(--font-size-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 1.5rem;
	}

	.screening-count {
		font-family: var(--font-mono);
		color: var(--color-text-tertiary);
		margin-left: 0.5rem;
	}

	.day-group {
		margin-bottom: 1.5rem;
	}

	.day-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
		margin-bottom: 0.5rem;
	}

	.screening-rows {
		display: flex;
		flex-direction: column;
	}

	.screening-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.screening-row:hover {
		background: var(--color-bg-subtle);
		margin: 0 -0.75rem;
		padding-left: 0.75rem;
		padding-right: 0.75rem;
	}

	.screening-time {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		font-weight: 600;
		min-width: 3rem;
	}

	.screening-film {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
		flex: 1;
	}

	.screening-film:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.screening-year {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		font-family: var(--font-mono);
	}

	.booking-link {
		color: var(--color-text-tertiary);
		flex-shrink: 0;
		padding: 0.25rem;
		transition: color var(--duration-fast) var(--ease-sharp);
	}

	.booking-link:hover {
		color: var(--color-text);
	}
</style>
