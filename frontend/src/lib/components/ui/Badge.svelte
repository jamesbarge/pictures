<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		variant = 'default',
		class: className = '',
		children
	}: {
		variant?: 'default' | 'accent' | 'muted';
		class?: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<span class={cn('badge', `badge-${variant}`, className)}>
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

	.badge-accent {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.badge-muted {
		color: var(--color-text-tertiary);
		border-color: var(--color-border-subtle);
	}
</style>
