<script lang="ts">
	import {
		groupByUrgency,
		getUrgencyLabel,
		formatLeaveBy,
		formatTravelTime,
		type ReachableScreening,
		type UrgencyGroup
	} from '$lib/travel-time';
	import { formatTime, getPosterImageAttributes } from '$lib/utils';

	let {
		screenings = [],
		totalScreenings = 0,
		finishedByTime
	}: {
		screenings: ReachableScreening[];
		totalScreenings: number;
		finishedByTime: Date;
	} = $props();

	const groups = $derived(groupByUrgency(screenings));

	const urgencyOrder: UrgencyGroup[] = ['leave_soon', 'leave_within_hour', 'later'];

	function urgencyClass(urgency: UrgencyGroup): string {
		switch (urgency) {
			case 'leave_soon':
				return 'urgency-soon';
			case 'leave_within_hour':
				return 'urgency-hour';
			default:
				return 'urgency-later';
		}
	}

	function finishedByStr(date: Date): string {
		return date.toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}
</script>

{#if screenings.length === 0}
	<!-- Empty state -->
	<div class="empty-state">
		<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<rect x="3" y="4" width="18" height="18" />
			<line x1="16" y1="2" x2="16" y2="6" />
			<line x1="8" y1="2" x2="8" y2="6" />
			<line x1="3" y1="10" x2="21" y2="10" />
		</svg>
		<h2 class="empty-title">NO REACHABLE SCREENINGS</h2>
		<p class="empty-desc">
			No screenings finish before
			<strong>{finishedByStr(finishedByTime)}</strong>
			that you can reach in time. Try a later deadline or different travel mode.
		</p>
		<p class="empty-meta">
			Checked {totalScreenings} screenings across all cinemas
		</p>
	</div>
{:else}
	<div class="results">
		<!-- Summary -->
		<p class="summary">
			<strong>{screenings.length}</strong> reachable screenings from {totalScreenings} total
		</p>

		{#each urgencyOrder as urgency (urgency)}
			{@const groupScreenings = groups[urgency]}
			{#if groupScreenings.length > 0}
				<div class="urgency-group">
					<!-- Group header -->
					<div class="group-header">
						<h2 class="group-label {urgencyClass(urgency)}">
							{getUrgencyLabel(urgency)}
						</h2>
						<span class="group-count">({groupScreenings.length})</span>
					</div>

					<!-- Screening cards -->
					<div class="cards">
						{#each groupScreenings as screening (screening.id)}
							{@const screeningTime = formatTime(screening.datetime)}
							<div class="card">
								<!-- Poster -->
								<div class="card-poster">
									{#if screening.film.posterUrl}
										{@const posterImage = getPosterImageAttributes(screening.film.posterUrl, {
											baseSize: 'w185',
											srcSetSizes: ['w92', 'w185'],
											sizes: '80px'
										})}
										<img
											src={posterImage?.src ?? screening.film.posterUrl}
											srcset={posterImage?.srcset}
											sizes={posterImage?.sizes}
											alt={screening.film.title}
											class="poster-img"
											loading="lazy"
											decoding="async"
										/>
									{:else}
										<div class="poster-placeholder">
											<span>NO POSTER</span>
										</div>
									{/if}
								</div>

								<!-- Content -->
								<div class="card-content">
									<!-- Leave-by badge -->
									<div class="leave-badge {urgencyClass(urgency)}">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<circle cx="12" cy="12" r="10" />
											<polyline points="12 6 12 12 16 14" />
										</svg>
										{formatLeaveBy(screening.leaveBy, screening.minutesUntilLeave)}
									</div>

									<!-- Film title -->
									<a href="/film/{screening.film.id}" class="film-title">
										{screening.film.title}
										{#if screening.film.year}
											<span class="film-year">({screening.film.year})</span>
										{/if}
									</a>

									<!-- Screening details -->
									<div class="details">
										<!-- Time -->
										<span class="detail-time">{screeningTime}</span>

										<!-- Cinema -->
										<span class="detail-cinema">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
												<circle cx="12" cy="10" r="3" />
											</svg>
											{screening.cinema.shortName || screening.cinema.name}
										</span>

										<!-- Travel time -->
										<span class="detail-travel">
											{#if screening.travelMode === 'walking'}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="5" r="1.5" fill="currentColor" /><path d="M10 21l1.5-7.5L14 16v5" /><path d="M10 13.5l-2 3.5" /><path d="M14 8l-2.5 5.5" /><path d="M10 8.5l2-1" /></svg>
											{:else if screening.travelMode === 'bicycling'}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" /><path d="M12 17.5V14l-3-3 4-3 2 3h2" /></svg>
											{:else}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="3" width="16" height="16" /><path d="M4 11h16" /><path d="M12 3v8" /><circle cx="8" cy="15" r="1" fill="currentColor" /><circle cx="16" cy="15" r="1" fill="currentColor" /><path d="M8 19l-2 3" /><path d="M16 19l2 3" /></svg>
											{/if}
											{formatTravelTime(screening.travelMinutes)}
										</span>

										<!-- Runtime -->
										{#if screening.film.runtime}
											<span class="detail-runtime">{screening.film.runtime} min</span>
										{/if}

										<!-- Format badge -->
										{#if screening.format}
											<span class="detail-format">{screening.format}</span>
										{/if}
									</div>

									<!-- Booking link -->
									{#if screening.bookingUrl}
										<a
											href={screening.bookingUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="booking-link"
										>
											BOOK TICKETS
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
												<polyline points="15 3 21 3 21 9" />
												<line x1="10" y1="14" x2="21" y2="3" />
											</svg>
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	/* ── Empty state ── */
	.empty-state {
		padding: 3rem 1.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface);
		text-align: center;
	}

	.empty-icon {
		width: 2.5rem;
		height: 2.5rem;
		color: var(--color-text-tertiary);
		margin: 0 auto 1rem;
	}

	.empty-title {
		font-size: var(--font-size-sm);
		font-weight: 700;
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}

	.empty-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		max-width: 28rem;
		margin: 0 auto;
	}

	.empty-desc strong {
		color: var(--color-text);
		font-family: var(--font-mono);
	}

	.empty-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		margin-top: 1rem;
	}

	/* ── Results ── */
	.results {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.summary {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.summary strong {
		color: var(--color-text);
	}

	/* ── Urgency groups ── */
	.urgency-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.group-label {
		font-size: var(--font-size-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.group-count {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
	}

	.urgency-soon {
		color: var(--color-accent);
	}

	.urgency-hour {
		color: var(--color-text);
	}

	.urgency-later {
		color: var(--color-text-secondary);
	}

	/* ── Cards ── */
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.card {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface);
		transition: border-color var(--duration-fast) var(--ease-sharp);
	}

	.card + .card {
		margin-top: -1px;
	}

	.card:hover {
		border-color: var(--color-text);
		z-index: 1;
	}

	/* ── Poster ── */
	.card-poster {
		flex-shrink: 0;
		width: 4rem;
	}

	@media (min-width: 640px) {
		.card-poster {
			width: 5rem;
		}
	}

	.poster-img {
		width: 100%;
		aspect-ratio: 2/3;
		object-fit: cover;
		display: block;
	}

	.poster-placeholder {
		width: 100%;
		aspect-ratio: 2/3;
		background: var(--color-bg-subtle);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.poster-placeholder span {
		font-size: 0.5rem;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	/* ── Content ── */
	.card-content {
		flex: 1;
		min-width: 0;
	}

	/* ── Leave-by badge ── */
	.leave-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		font-size: var(--font-size-xs);
		font-weight: 700;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 0.5rem;
	}

	.leave-badge svg {
		width: 0.875rem;
		height: 0.875rem;
	}

	.leave-badge.urgency-soon {
		background: color-mix(in srgb, var(--color-accent) 15%, transparent);
		color: var(--color-accent);
	}

	.leave-badge.urgency-hour {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.leave-badge.urgency-later {
		background: var(--color-bg-subtle);
		color: var(--color-text-secondary);
	}

	/* ── Film title ── */
	.film-title {
		display: block;
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		text-decoration: none;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color var(--duration-fast) var(--ease-sharp);
	}

	.film-title:hover {
		color: var(--color-accent);
	}

	.film-year {
		color: var(--color-text-tertiary);
		font-weight: 400;
		margin-left: 0.25rem;
	}

	/* ── Details row ── */
	.details {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.375rem;
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}

	.detail-time {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--color-text);
	}

	.detail-cinema {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.detail-cinema svg {
		width: 0.875rem;
		height: 0.875rem;
	}

	.detail-travel {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--color-accent);
		font-family: var(--font-mono);
	}

	.detail-travel svg {
		width: 0.875rem;
		height: 0.875rem;
	}

	.detail-runtime {
		color: var(--color-text-tertiary);
		font-family: var(--font-mono);
	}

	.detail-format {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: var(--color-bg-subtle);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-family: var(--font-mono);
	}

	/* ── Booking link ── */
	.booking-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.5rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-accent);
		text-decoration: none;
		transition: opacity var(--duration-fast) var(--ease-sharp);
	}

	.booking-link:hover {
		opacity: 0.7;
	}

	.booking-link svg {
		width: 0.75rem;
		height: 0.75rem;
	}
</style>
