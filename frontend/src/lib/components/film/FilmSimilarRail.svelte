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
		width: fit-content;
		max-width: calc(100% - 32px);
		margin: 0;
		padding: 28px 16px 28px;
	}

	@media (min-width: 768px) {
		.similar { max-width: calc(100% - 48px); padding: 35px 24px 35px; }
	}

	.similar-head {
		background: #1f1f1f;
		color: #eae5c2;
		padding: 10px 16px;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		border: 1px solid var(--color-border);
		border-bottom: none;
	}

	.similar-title {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 18px;
		letter-spacing: -0.01em;
		line-height: 1;
		color: #eae5c2;
		text-transform: uppercase;
	}

	@media (min-width: 768px) {
		.similar-title { font-size: 20px; }
	}

	.similar-rail {
		display: flex;
		border: 1px solid var(--color-border);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		overflow: hidden;
		background: var(--color-surface);
	}

	@media (max-width: 767px) {
		.similar-rail {
			overflow-x: auto;
			scroll-snap-type: x mandatory;
		}
		.similar-card { scroll-snap-align: start; }
	}

	.similar-card {
		display: flex;
		flex-direction: column;
		width: 160px;
		flex-shrink: 0;
		color: var(--color-text);
		text-decoration: none;
		border-right: 1px solid var(--color-border);
		padding: 12px;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.similar-card:hover { background: var(--color-cream); }
	.similar-card:last-child { border-right: none; }

	.similar-poster {
		position: relative;
		aspect-ratio: 2 / 3;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		margin-bottom: 10px;
		overflow: hidden;
	}

	.similar-poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.similar-poster-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 8px;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}

	.similar-name {
		margin: 0 0 4px;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 13px;
		line-height: 1.15;
		letter-spacing: -0.01em;
		color: var(--color-text);
		text-transform: uppercase;
	}

	.similar-year {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 500;
		color: var(--color-text-tertiary);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>
