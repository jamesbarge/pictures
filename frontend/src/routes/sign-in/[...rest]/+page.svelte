<!-- Never rendered: +page.ts always 307-redirects to `/`. SvelteKit still needs a
     component for the route to resolve, and the route is kept rather than deleted so
     existing links and bookmarks redirect home instead of 404ing (asserted by
     tests/mobile.spec.ts "sign-in is gone"). -->
<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>
