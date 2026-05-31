<script lang="ts">
	import type { PageData } from './$types';
	import { getPosterImageAttributes } from '$lib/utils';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { personSchema, breadcrumbSchema } from '$lib/seo/json-ld';

	let { data }: { data: PageData } = $props();

	const name = $derived(data.person.name);
	const totalFilms = $derived(data.person.filmCount);

	const roles = $derived(
		[data.person.isDirector ? 'Director' : null, data.person.isCast ? 'Actor' : null].filter(
			Boolean
		) as string[]
	);
	const roleLabel = $derived(roles.join(' · ') || 'Filmmaker');

	const allTitles = $derived(
		[...data.directorFilms, ...data.actorFilms].map((f) => f.title)
	);

	// London-tz short date — hoisted formatter (module-const pattern).
	const dateFmt = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/London',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
	function nextLabel(iso: string | null, count: number): string {
		const when = iso ? dateFmt.format(new Date(iso)) : null;
		const screenings = `${count} ${count === 1 ? 'screening' : 'screenings'}`;
		return when ? `Next ${when} · ${screenings}` : screenings;
	}
</script>

<svelte:head>
	<title>{name} — films showing in London | Pictures</title>
	<meta
		name="description"
		content="Films by {name} ({roleLabel}) currently showing across London cinemas — {totalFilms} {totalFilms ===
		1
			? 'film'
			: 'films'} with upcoming screenings."
	/>
	<link rel="canonical" href="https://pictures.london/people/{encodeURIComponent(name)}" />
</svelte:head>

<JsonLd data={personSchema(name, roles, allTitles)} />
<JsonLd
	data={breadcrumbSchema([
		{ name: 'Home', url: '/' },
		{ name: 'Directors', url: '/directors' },
		{ name, url: `/people/${encodeURIComponent(name)}` }
	])}
/>

{#snippet filmGrid(films: PageData['directorFilms'])}
	<div class="film-grid">
		{#each films as film (film.id)}
			{@const poster = getPosterImageAttributes(film.posterUrl, {
				baseSize: 'w342',
				srcSetSizes: ['w154', 'w185', 'w342'],
				sizes: '(min-width: 1024px) 220px, (min-width: 768px) 30vw, 45vw'
			})}
			<a class="film-card" href="/film/{film.id}">
				<div class="poster">
					{#if poster}
						<img
							src={poster.src}
							srcset={poster.srcset}
							sizes={poster.sizes}
							alt="{film.title} poster"
							width="342"
							height="513"
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<div class="poster-fallback">{film.title}</div>
					{/if}
				</div>
				<div class="info">
					<span class="title">{film.title}{#if film.year}<span class="year"> ({film.year})</span>{/if}</span>
					<span class="next">{nextLabel(film.nextScreeningAt, film.screeningCount)}</span>
				</div>
			</a>
		{/each}
	</div>
{/snippet}

<main class="page">
	<header class="masthead">
		<a class="back" href="/directors">← Directors</a>
		<h1 class="font-display">{name}</h1>
		<p class="sub">{roleLabel} · {totalFilms} {totalFilms === 1 ? 'film' : 'films'} showing in London</p>
	</header>

	{#if data.directorFilms.length > 0}
		<section>
			{#if data.actorFilms.length > 0}<h2 class="section-label">As Director</h2>{/if}
			{@render filmGrid(data.directorFilms)}
		</section>
	{/if}

	{#if data.actorFilms.length > 0}
		<section>
			<h2 class="section-label">On Screen</h2>
			{@render filmGrid(data.actorFilms)}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}
	.masthead {
		margin-bottom: 2rem;
	}
	.back {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-muted);
		text-decoration: none;
	}
	.back:hover {
		color: var(--color-text);
	}
	h1 {
		font-size: clamp(2rem, 6vw, 3.5rem);
		line-height: 1.05;
		margin: 0.5rem 0 0.25rem;
		text-transform: uppercase;
		letter-spacing: -0.01em;
	}
	.sub {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-muted);
		margin: 0;
	}
	.section-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-muted);
		margin: 2rem 0 1rem;
		border-bottom: 1px solid var(--color-border, var(--color-muted));
		padding-bottom: 0.5rem;
	}
	.film-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		column-gap: 1rem;
		row-gap: 1.5rem;
		content-visibility: auto;
		contain-intrinsic-size: auto 900px;
	}
	@media (min-width: 768px) {
		.film-grid {
			grid-template-columns: repeat(3, 1fr);
			column-gap: 1.25rem;
		}
	}
	@media (min-width: 1024px) {
		.film-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.film-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-decoration: none;
		color: var(--color-text);
	}
	.poster {
		aspect-ratio: 2 / 3;
		overflow: hidden;
		background: var(--color-screening-bg, var(--color-surface));
	}
	.poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.2s ease;
	}
	.film-card:hover .poster img {
		transform: scale(1.03);
	}
	.poster-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 0.5rem;
		font-size: 0.75rem;
		text-align: center;
		color: var(--color-muted);
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.title {
		font-size: 0.9rem;
		font-weight: 500;
		line-height: 1.2;
	}
	.year {
		color: var(--color-muted);
		font-weight: 400;
	}
	.next {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted);
	}
</style>
