<script lang="ts">
	/**
	 * Global ⌘K / Ctrl+K binding for the command palette.
	 *
	 * Mounted once in the root layout so the binding is active on every
	 * route. Cooperates with the existing inline SearchInput.svelte: when
	 * the inline input is already focused, we yield to it (the user is
	 * already searching). Otherwise we toggle the global palette.
	 *
	 * In step 5 this becomes the trigger that mounts the actual
	 * <CommandPalette /> modal. For now it sets `palette.open = true`
	 * which has no visible side-effect — useful for verifying the
	 * binding works without committing to the UI shell yet.
	 */
	import { onMount } from 'svelte';
	import { palette } from '$lib/stores/palette.svelte';

	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
			if (!isCmdK) return;

			// Yield to the inline SearchInput when it's the active element
			// — the user is already searching there.
			const active = document.activeElement;
			const isInlineSearchInput =
				active instanceof HTMLInputElement &&
				active.type === 'search' &&
				active.getAttribute('role') === 'combobox';
			if (isInlineSearchInput) return;

			e.preventDefault();
			palette.toggle('cmdk');
		}

		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>
