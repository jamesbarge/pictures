<script lang="ts">
	let {
		width = '100%',
		height = '1rem',
		class: className = ''
	}: {
		width?: string;
		height?: string;
		class?: string;
	} = $props();
</script>

<div
	class="skeleton {className}"
	style="width: {width}; height: {height};"
	aria-hidden="true"
></div>

<style>
	.skeleton {
		background: var(--color-bg-subtle);
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
