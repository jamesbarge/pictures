<script lang="ts">
	let {
		title,
		description = '',
		children
	}: {
		title: string;
		description?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<div class="empty-state" role="status">
	<h3 class="empty-title font-display">{title}</h3>
	{#if description}
		<p class="empty-description">{description}</p>
	{/if}
	{#if children}
		<div class="empty-action">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		text-align: center;
	}

	.empty-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
	}

	.empty-description {
		margin-top: 0.5rem;
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		max-width: 28rem;
	}

	.empty-action {
		margin-top: 1.5rem;
	}
</style>
