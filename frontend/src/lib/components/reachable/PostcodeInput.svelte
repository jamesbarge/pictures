<script lang="ts">
	import {
		lookupPostcode,
		isValidPostcodeFormat,
		formatPostcode,
		isWithinLondon
	} from '$lib/postcode';
	import { debounce } from '$lib/utils';

	let {
		value = '',
		onchange
	}: {
		value: string;
		onchange: (
			postcode: string,
			coordinates: { lat: number; lng: number } | null,
			error?: string
		) => void;
	} = $props();

	type Status = 'idle' | 'validating' | 'valid' | 'invalid' | 'warning';

	let status = $state<Status>('idle');
	let locationName = $state<string | null>(null);
	let warningMessage = $state<string | null>(null);

	const doLookup = debounce(async (postcode: string) => {
		if (postcode.replace(/\s/g, '').length < 5) {
			status = 'idle';
			locationName = null;
			onchange(postcode, null);
			return;
		}

		if (!isValidPostcodeFormat(postcode)) {
			status = 'invalid';
			locationName = null;
			onchange(postcode, null, 'Invalid postcode format');
			return;
		}

		status = 'validating';
		warningMessage = null;

		try {
			const result = await lookupPostcode(postcode);

			if (!result) {
				status = 'invalid';
				locationName = null;
				onchange(postcode, null, 'Postcode not found');
				return;
			}

			const inLondon = isWithinLondon(result.latitude, result.longitude);
			if (!inLondon) {
				warningMessage = 'This postcode is outside London — travel times may be long';
				status = 'warning';
			} else {
				status = 'valid';
			}

			locationName = result.admin_district || formatPostcode(postcode);

			onchange(formatPostcode(postcode), {
				lat: result.latitude,
				lng: result.longitude
			});
		} catch {
			status = 'invalid';
			locationName = null;
			onchange(postcode, null, 'Failed to validate postcode');
		}
	}, 500);

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const newValue = target.value.toUpperCase();
		onchange(newValue, null);
		doLookup(newValue);
	}

	function handleBlur() {
		if (value && isValidPostcodeFormat(value)) {
			const formatted = formatPostcode(value);
			if (formatted !== value) {
				onchange(formatted, null);
				doLookup(formatted);
			}
		}
	}

	// Validate on mount if value exists
	$effect(() => {
		if (value && value.replace(/\s/g, '').length >= 5) {
			doLookup(value);
		}
	});

	const showError = $derived(status === 'invalid' && value.length > 0);
	const showSuccess = $derived(status === 'valid' || status === 'warning');
</script>

<div class="postcode-input">
	<label class="label" for="postcode-field">YOUR POSTCODE</label>

	<div class="input-wrapper">
		<!-- Map pin icon -->
		<svg class="icon-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
			<circle cx="12" cy="10" r="3" />
		</svg>

		<input
			id="postcode-field"
			type="text"
			value={value}
			oninput={handleInput}
			onblur={handleBlur}
			placeholder="e.g. E1 6PW"
			autocomplete="postal-code"
			autocapitalize="characters"
			spellcheck="false"
			class="input"
			class:input-error={showError}
			class:input-success={showSuccess}
		/>

		<!-- Status icon -->
		<div class="icon-right">
			{#if status === 'validating'}
				<svg class="icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Validating">
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
			{:else if status === 'valid'}
				<svg class="icon-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Valid">
					<polyline points="20 6 9 17 4 12" />
				</svg>
			{:else if status === 'warning'}
				<svg class="icon-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Warning">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			{:else if status === 'invalid' && value.length > 0}
				<svg class="icon-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Invalid">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			{/if}
		</div>
	</div>

	<!-- Location name -->
	{#if locationName && showSuccess}
		<p class="status-text status-success">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
			{locationName}
		</p>
	{/if}

	<!-- Warning -->
	{#if warningMessage && status === 'warning'}
		<p class="status-text status-warning">{warningMessage}</p>
	{/if}

	<!-- Error -->
	{#if showError}
		<p class="status-text status-error">Invalid postcode</p>
	{/if}
</div>

<style>
	.postcode-input {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
	}

	.input-wrapper {
		position: relative;
	}

	.icon-left {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1.125rem;
		height: 1.125rem;
		color: var(--color-text-tertiary);
		pointer-events: none;
	}

	.input {
		width: 100%;
		padding: 0.75rem 2.5rem 0.75rem 2.5rem;
		font-family: var(--font-mono);
		font-size: var(--font-size-base);
		letter-spacing: 0.04em;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border-subtle);
		border-radius: 0;
		outline: none;
		transition: border-color var(--duration-fast) var(--ease-sharp);
	}

	.input::placeholder {
		color: var(--color-text-tertiary);
		font-family: var(--font-mono);
	}

	.input:focus {
		border-color: var(--color-text);
	}

	.input-error {
		border-color: var(--color-accent);
	}

	.input-success {
		border-color: var(--color-text);
	}

	.icon-right {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
	}

	.icon-right svg {
		width: 1.125rem;
		height: 1.125rem;
	}

	.icon-spin {
		color: var(--color-text-tertiary);
		animation: spin 1s linear infinite;
	}

	.icon-success {
		color: var(--color-text);
	}

	.icon-warning {
		color: var(--color-accent);
	}

	.icon-error {
		color: var(--color-accent);
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.status-text {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--font-size-xs);
	}

	.status-text svg {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
	}

	.status-success {
		color: var(--color-text);
	}

	.status-warning {
		color: var(--color-accent);
	}

	.status-error {
		color: var(--color-accent);
	}
</style>
