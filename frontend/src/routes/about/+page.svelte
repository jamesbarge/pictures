<svelte:head>
	<title>About — pictures · london</title>
	<meta name="description" content="Pictures London shows every film screening across 59 London cinemas in one calendar. Independent venues, chains, repertory and new releases." />
</svelte:head>

<section class="py-8">
	<div class="max-w-[600px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-2xl font-bold tracking-tight-swiss uppercase mb-6">
			ABOUT
		</h1>

		<div class="prose">
			<p>
				<strong>pictures · london</strong> is a cinema calendar that shows every film screening
				across London's cinemas in one place. Independent venues, chains, repertory screenings,
				new releases — all in a single, searchable calendar.
			</p>

			<p>
				We cover 59 cinemas across London, from the BFI Southbank to the Prince Charles Cinema,
				from Curzon to Everyman, from the Rio to the Genesis. If it's showing in London, it's here.
			</p>

			<h2>HOW IT WORKS</h2>
			<p>
				Screening data is collected daily from cinema websites and APIs. Films are enriched with
				metadata from TMDB, Letterboxd ratings, and director filmographies. The data is refreshed
				weekly with daily quality checks.
			</p>

			<h2>CONTACT</h2>
			<p>
				Questions, feedback, or missing cinema? Get in touch at
				<a href="mailto:hello@pictures.london">hello@pictures.london</a>
			</p>
		</div>
	</div>
</section>

<style>
	.prose {
		font-size: var(--font-size-base);
		line-height: 1.7;
		color: var(--color-text-secondary);
	}

	.prose p {
		margin-bottom: 1.25rem;
	}

	.prose h2 {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text);
		margin-top: 2rem;
		margin-bottom: 0.75rem;
	}

	.prose a {
		color: var(--color-text);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.prose strong {
		color: var(--color-text);
		font-weight: 600;
	}
</style>
