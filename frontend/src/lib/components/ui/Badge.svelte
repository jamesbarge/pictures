<script lang="ts">
	let {
		variant = 'default',
		children
	}: {
		variant?: 'default' | 'muted';
		children: import('svelte').Snippet;
	} = $props();
</script>

<span class={['badge', `badge-${variant}`]}>
	{@render children()}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		line-height: 1.4;
		border: 1px solid var(--color-border);
	}

	.badge-default {
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.badge-muted {
		color: var(--color-text-tertiary);
		border-color: var(--color-border-subtle);
	}
</style>
