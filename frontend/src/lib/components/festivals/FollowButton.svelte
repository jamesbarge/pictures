<script lang="ts">
	import { useClerkContext } from 'svelte-clerk/client';
	import { apiPost, apiDelete } from '$lib/api/client';

	let { festivalSlug, initialFollowing = false }: { festivalSlug: string; initialFollowing?: boolean } = $props();

	const ctx = useClerkContext();
	const isSignedIn = $derived(!!ctx.auth.userId);

	let following = $state(initialFollowing);
	let loading = $state(false);

	async function toggle() {
		if (!isSignedIn) return;

		const token = await ctx.session.getToken();
		if (!token) return;

		loading = true;
		try {
			if (following) {
				await apiDelete(`/api/festivals/${festivalSlug}/follow`, { token });
				following = false;
			} else {
				await apiPost(`/api/festivals/${festivalSlug}/follow`, {}, { token });
				following = true;
			}
		} catch (e) {
			console.error('[festival] Follow toggle failed:', e instanceof Error ? e.message : e);
		} finally {
			loading = false;
		}
	}
</script>

{#if isSignedIn}
	<button
		onclick={toggle}
		disabled={loading}
		class="follow-btn"
		class:active={following}
		aria-pressed={following}
	>
		{#if loading}
			...
		{:else if following}
			FOLLOWING
		{:else}
			FOLLOW
		{/if}
	</button>
{/if}

<style>
	.follow-btn {
		padding: 0.375rem 0.75rem;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		border: 1.5px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-sharp);
	}

	.follow-btn:hover {
		border-color: var(--color-foreground);
		color: var(--color-foreground);
	}

	.follow-btn.active {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
	}

	.follow-btn:disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
