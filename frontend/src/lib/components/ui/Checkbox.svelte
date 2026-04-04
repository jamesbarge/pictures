<script lang="ts">
	let {
		checked = false,
		label,
		onToggle
	}: {
		checked: boolean;
		label: string;
		onToggle: () => void;
	} = $props();
</script>

<label class="checkbox-row">
	<input
		type="checkbox"
		{checked}
		onchange={onToggle}
		class="sr-only"
	/>
	<span class="checkbox-box" class:checked aria-hidden="true">
		{#if checked}
			<svg aria-hidden="true" width="10" height="8" viewBox="0 0 10 8" fill="none">
				<path d="M1 4L3.5 6.5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
			</svg>
		{/if}
	</span>
	<span class="checkbox-label">{label}</span>
</label>

<style>
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		min-height: 2.75rem;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.checkbox-row:hover {
		background: var(--color-bg-subtle);
	}

	.checkbox-box {
		width: 16px;
		height: 16px;
		border: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--color-surface);
	}

	.checkbox-box.checked {
		background: var(--color-text);
		border-color: var(--color-text);
	}

	.checkbox-label {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}
</style>
