// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthObject } from 'svelte-clerk/server';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			auth(): AuthObject;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
