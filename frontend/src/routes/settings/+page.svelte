<script lang="ts">
	import { preferences } from '$lib/stores/preferences.svelte';
	import { filmStatuses } from '$lib/stores/film-status.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';

	const viewOptions = [
		{ value: 'poster', label: 'POSTER' },
		{ value: 'text', label: 'TEXT' }
	];

	const notInterestedIds = $derived(filmStatuses.getFilmIdsByStatus('not_interested'));
</script>

<svelte:head>
	<title>Settings — pictures · london</title>
	<meta name="description" content="Customise your Pictures London experience — view mode, hidden films, and preferences" />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[600px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase mb-6 pb-1.5 border-b-2 border-[var(--color-border)]">
			SETTINGS
		</h1>

		<!-- Default View -->
		<div class="setting-row">
			<div class="setting-info">
				<h2 class="setting-label">DEFAULT VIEW</h2>
				<p class="setting-desc">Choose between poster grid and text list</p>
			</div>
			<SegmentedControl
				options={viewOptions}
				selected={preferences.viewMode}
				onSelect={(v) => preferences.viewMode = v as 'poster' | 'text'}
			/>
		</div>

		<!-- Theme -->
		<div class="setting-row">
			<div class="setting-info">
				<h2 class="setting-label">THEME</h2>
				<p class="setting-desc">Use the House Lights dimmer in the header to adjust brightness</p>
			</div>
		</div>

		<!-- Not Interested -->
		<div class="setting-row">
			<div class="setting-info">
				<h2 class="setting-label">NOT INTERESTED</h2>
				<p class="setting-desc">{notInterestedIds.length} films hidden from your calendar</p>
			</div>
			{#if notInterestedIds.length > 0}
				<button
					class="clear-btn"
					onclick={() => {
						for (const id of notInterestedIds) {
							filmStatuses.removeStatus(id);
						}
					}}
				>
					CLEAR ALL
				</button>
			{/if}
		</div>

		<!-- Clear All Data -->
		<div class="setting-row danger">
			<div class="setting-info">
				<h2 class="setting-label">CLEAR ALL DATA</h2>
				<p class="setting-desc">Remove all watchlist items, preferences, and filters from this browser</p>
			</div>
			<button
				class="clear-btn danger-btn"
				onclick={() => {
					if (confirm('Clear all local data? This cannot be undone.')) {
						filmStatuses.clearAll();
						localStorage.clear();
						location.reload();
					}
				}}
			>
				CLEAR
			</button>
		</div>
	</div>
</section>

<style>
	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.setting-info {
		flex: 1;
	}

	.setting-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text);
	}

	.setting-desc {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		margin-top: 0.25rem;
	}

	.clear-btn {
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		padding: 0.375rem 0.75rem;
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-sharp);
	}

	.clear-btn:hover {
		border-color: var(--color-border);
		color: var(--color-text);
	}

	.danger-btn {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.danger-btn:hover {
		background: var(--color-accent);
		color: white;
	}
</style>
