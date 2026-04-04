<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} — pictures · london</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="py-16">
	<div class="max-w-[600px] mx-auto px-4 md:px-8 text-center">
		<h1 class="font-display text-5xl font-bold tracking-tight-swiss">{page.status}</h1>
		<p class="text-sm text-[var(--color-text-secondary)] mt-2 uppercase tracking-wide-swiss">
			{page.error?.message ?? 'Page not found'}
		</p>
		<a
			href="/"
			class="inline-block mt-6 text-xs uppercase tracking-wide-swiss text-[var(--color-text-tertiary)] border border-[var(--color-border-subtle)] px-4 py-2 hover:border-[var(--color-border)] hover:text-[var(--color-text)] transition-colors"
		>
			BACK TO CALENDAR
		</a>
	</div>
</section>
