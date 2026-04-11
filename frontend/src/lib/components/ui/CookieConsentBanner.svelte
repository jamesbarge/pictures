<script lang="ts">
	import { browser } from '$app/environment';
	import { cookieConsent } from '$lib/stores/cookie-consent.svelte';
</script>

{#if browser && !cookieConsent.hasDecided}
	<div class="consent-banner" role="dialog" aria-label="Cookie consent">
		<p class="consent-text">
			We use analytics cookies to understand how you use the site and improve your experience.
		</p>
		<div class="consent-actions">
			<button class="consent-btn consent-btn-reject" onclick={() => cookieConsent.reject()}>
				REJECT NON-ESSENTIAL
			</button>
			<button class="consent-btn consent-btn-accept" onclick={() => cookieConsent.accept()}>
				ACCEPT ALL
			</button>
		</div>
	</div>
{/if}

<style>
	.consent-banner {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		background: var(--color-surface);
		border-top: 2px solid var(--color-border);
	}

	.consent-text {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex: 1;
	}

	.consent-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.consent-btn {
		padding: 0.5rem 1rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.consent-btn-reject {
		background: transparent;
		color: var(--color-text-secondary);
	}

	.consent-btn-reject:hover {
		color: var(--color-text);
		background: var(--color-bg-subtle);
	}

	.consent-btn-accept {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
	}

	.consent-btn-accept:hover {
		opacity: 0.9;
	}

	@media (max-width: 640px) {
		.consent-banner {
			flex-direction: column;
			padding: 1rem;
			gap: 0.75rem;
		}

		.consent-actions {
			width: 100%;
		}

		.consent-btn {
			flex: 1;
		}
	}
</style>
