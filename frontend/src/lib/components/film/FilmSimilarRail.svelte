<script lang="ts">
	interface SimilarFilm {
		id: string;
		title: string;
		year: number | null;
		posterUrl: string | null;
	}

	let { similar }: { similar: SimilarFilm[] } = $props();
</script>

{#if similar.length >= 2}
	<section class="similar" aria-labelledby="similar-heading">
		<header class="similar-head">
			<h2 id="similar-heading" class="similar-title">If you like this</h2>
		</header>
		<div class="similar-rail">
			{#each similar as s (s.id)}
				<a href="/film/{s.id}" class="similar-card">
					<div class="similar-poster">
						{#if s.posterUrl}
							<img src={s.posterUrl} alt={s.title} loading="lazy" decoding="async" />
						{:else}
							<div class="similar-poster-fallback"><span>{s.title}</span></div>
						{/if}
					</div>
					<h3 class="similar-name">{s.title}</h3>
					{#if s.year}<p class="similar-year">{s.year}</p>{/if}
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	.similar {
		max-width: 1400px;
		margin: 0 auto;
		padding: 32px 2rem 64px;
		border-top: 1px solid var(--color-border-subtle);
	}

	.similar-head {
		margin-bottom: 20px;
	}

	.similar-title {
		margin: 0;
		font-family: var(--font-serif);
		font-weight: 400;
		font-size: 28px;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 36';
	}

	.similar-rail {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
		gap: 20px 18px;
	}

	@media (max-width: 767px) {
		.similar-rail {
			display: flex;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			gap: 14px;
			padding-bottom: 8px;
		}
		.similar-card {
			flex: 0 0 132px;
			scroll-snap-align: start;
		}
	}

	.similar-card {
		display: flex;
		flex-direction: column;
		color: var(--color-text);
		text-decoration: none;
	}

	.similar-poster {
		position: relative;
		aspect-ratio: 2 / 3;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-subtle);
		margin-bottom: 8px;
		overflow: hidden;
	}

	.similar-poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.similar-poster-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 8px;
		font-family: var(--font-serif);
		font-size: 12px;
		color: var(--color-text-tertiary);
	}

	.similar-name {
		margin: 0 0 2px;
		font-family: var(--font-serif);
		font-weight: 400;
		font-size: 14px;
		line-height: 1.2;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
	}

	.similar-year {
		margin: 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12px;
		color: var(--color-text-tertiary);
	}
</style>
