<svelte:head>
	<title>Privacy — pictures · london</title>
	<meta name="description" content="Privacy policy for Pictures London — how we handle your data, analytics, and cookies" />
</svelte:head>

<section class="py-8">
	<div class="max-w-[600px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-2xl font-bold tracking-tight-swiss uppercase mb-6">PRIVACY POLICY</h1>

		<div class="prose">
			<h2>DATA WE COLLECT</h2>
			<p>We collect minimal data to provide the service. There are no accounts and no sign-in, so we hold no personal details about you. Your film preferences (watchlist, not interested) stay in your own browser's localStorage and are never sent to us.</p>

			<h2>ANALYTICS</h2>
			<p>We use PostHog for anonymous usage analytics, and only after you accept analytics cookies. No personal data is shared with third parties.</p>

			<h2>COOKIES</h2>
			<p>We set no cookies until you accept them. If you do, PostHog sets an analytics cookie so repeat visits are not double-counted; if you decline, none is set. Your "House Lights" dimmer setting, theme and film preferences are stored in localStorage, not cookies, and never leave your device.</p>

			<h2>CONTACT</h2>
			<p>For privacy questions: <a href="mailto:hello@pictures.london">hello@pictures.london</a></p>
		</div>
	</div>
</section>

<style>
	.prose { font-size: var(--font-size-base); line-height: 1.7; color: var(--color-text-secondary); }
	.prose p { margin-bottom: 1.25rem; }
	.prose h2 { font-size: var(--font-size-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text); margin-top: 2rem; margin-bottom: 0.75rem; }
	.prose a { color: var(--color-text); text-decoration: underline; text-underline-offset: 2px; }
</style>
