<script lang="ts">
	/**
	 * A single parsed-intent chip rendered inside the palette's input row.
	 * Refined brutalist: zero radius, uppercase tracked label, mono ×
	 * remove button. Snap motion only.
	 */
	interface Props {
		label: string;
		onRemove: () => void;
	}

	let { label, onRemove }: Props = $props();
</script>

<button
	type="button"
	class="chip"
	aria-label="{label}. Press to remove."
	onclick={onRemove}
>
	<span class="label">{label}</span>
	<span aria-hidden="true" class="remove">×</span>
</button>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px 2px 6px;
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border: none;
		font-family: var(--font-sans, 'Inter', sans-serif);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
	}

	.chip:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.remove {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 13px;
		line-height: 1;
		opacity: 0.6;
	}

	.chip:hover .remove,
	.chip:focus-visible .remove {
		opacity: 1;
	}
</style>
